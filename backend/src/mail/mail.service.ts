import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import type { EnquiryMailPayload } from "./types/enquiry-mail.types";

type MailPayload = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
};

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("MAIL_HOST")?.trim() ?? "";
    const portRaw = this.config.get<string>("MAIL_PORT")?.trim() ?? "";
    const user = this.config.get<string>("MAIL_USER")?.trim() ?? "";
    const pass = this.config.get<string>("MAIL_PASS")?.trim() ?? "";
    const secure = this.config.get<string>("MAIL_SECURE")?.trim() === "true";

    this.fromAddress = this.config.get<string>("MAIL_FROM")?.trim() || "no-reply@3klimited.com";
    this.fromName = this.config.get<string>("MAIL_FROM_NAME")?.trim() || "3K Financial & Accounting Services Ltd";

    if (!host || !portRaw) {
      this.transporter = null;
      this.log.warn("Mail service disabled: set MAIL_HOST and MAIL_PORT to enable SMTP.");
      return;
    }

    const port = Number(portRaw);
    if (!Number.isFinite(port) || port <= 0) {
      this.transporter = null;
      this.log.error(`Mail service disabled: invalid MAIL_PORT "${portRaw}".`);
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
    this.log.log(
      `Mail transporter ready: host=${host} port=${port} secure=${secure} auth=${user && pass ? "yes" : "no"}`,
    );
  }

  isEnabled(): boolean {
    return this.transporter !== null;
  }

  async send(payload: MailPayload): Promise<{ messageId: string }> {
    if (!this.transporter) {
      throw new ServiceUnavailableException("Mail service is not configured.");
    }

    const from = this.fromName ? `"${this.fromName}" <${this.fromAddress}>` : this.fromAddress;
    const msg: SendMailOptions = {
      from,
      to: payload.to,
      subject: payload.subject,
      ...(payload.text ? { text: payload.text } : {}),
      ...(payload.html ? { html: payload.html } : {}),
      ...(payload.cc ? { cc: payload.cc } : {}),
      ...(payload.bcc ? { bcc: payload.bcc } : {}),
      ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
    };

    const toStr = Array.isArray(payload.to) ? payload.to.join(", ") : String(payload.to);
    this.log.log(`Sending mail subject="${payload.subject}" to=${toStr}${payload.replyTo ? ` replyTo=${payload.replyTo}` : ""}`);

    try {
      const info = await this.transporter.sendMail(msg);
      const mid = info.messageId ?? "(no messageId)";
      this.log.log(`Mail sent messageId=${mid} to=${toStr}`);
      return { messageId: mid };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.log.error(`Mail send failed to=${toStr} subject="${payload.subject}": ${detail}`);
      throw err;
    }
  }

  /**
   * Sends two emails (no DB): (1) staff/admin — new enquiry details; (2) enquirer — we received your message.
   * Configure recipients with `MAIL_ENQUIRY_ADMIN_TO` (comma-separated) or fallback `MAIL_ADMIN_TO`.
   */
  async sendEnquiryEmails(payload: EnquiryMailPayload): Promise<{
    admin: { messageId: string; to: string[] };
    user: { messageId: string; to: string };
  }> {
    if (!this.transporter) {
      throw new ServiceUnavailableException("Mail service is not configured.");
    }

    const email = String(payload.email ?? "").trim().toLowerCase();
    const fullName = String(payload.fullName ?? "").trim();
    const interest = String(payload.interest ?? "").trim();
    const phone = String(payload.phone ?? "").trim();
    const code = payload.phoneCountryCode?.trim() ?? "";
    const phoneLine = code ? `${code} ${phone}` : phone;

    if (!email) {
      throw new BadRequestException("Enquiry email is required.");
    }

    const adminRaw =
      this.config.get<string>("MAIL_ENQUIRY_ADMIN_TO")?.trim() ??
      this.config.get<string>("MAIL_ADMIN_TO")?.trim() ??
      "";
    const adminTos = [...new Set(normalizeEnquiryAdminEmails(adminRaw))];
    if (adminTos.length === 0) {
      this.log.warn(
        "sendEnquiryEmails: no admin recipients (set MAIL_ENQUIRY_ADMIN_TO or MAIL_ADMIN_TO).",
      );
      throw new ServiceUnavailableException(
        "Enquiry admin recipient is not configured. Set MAIL_ENQUIRY_ADMIN_TO or MAIL_ADMIN_TO (comma-separated emails).",
      );
    }

    this.log.log(
      `sendEnquiryEmails: enquirer=${email} fullName=${fullName.slice(0, 80)} adminCount=${adminTos.length}`,
    );

    const subjectAdmin = `New enquiry from ${fullName || email}`;
    const textAdmin = [
      "A new website enquiry was submitted.",
      "",
      `Name: ${fullName || "(not provided)"}`,
      `Email: ${email}`,
      `Phone: ${phoneLine || "(not provided)"}`,
      `Interest: ${interest || "(not provided)"}`,
      "",
      "Reply directly to this person using the email address above.",
    ].join("\n");

    const htmlAdmin = `
<p>A new website enquiry was submitted.</p>
<ul>
  <li><strong>Name:</strong> ${escapeHtml(fullName || "(not provided)")}</li>
  <li><strong>Email:</strong> ${escapeHtml(email)}</li>
  <li><strong>Phone:</strong> ${escapeHtml(phoneLine || "(not provided)")}</li>
  <li><strong>Interest:</strong> ${escapeHtml(interest || "(not provided)")}</li>
</ul>
<p>Reply directly to this person using their email address.</p>
`.trim();

    const subjectUser = "We received your enquiry";
    const textUser = [
      `Hi ${fullName || "there"},`,
      "",
      "Thank you for reaching out. We have received your enquiry and will get back to you as soon as we can.",
      "",
      "A quick summary of what you sent us:",
      `- Interest: ${interest || "(not specified)"}`,
      `- Phone: ${phoneLine || "(not provided)"}`,
      "",
      "Kind regards,",
      this.fromName,
    ].join("\n");

    const htmlUser = `
<p>Hi ${escapeHtml(fullName || "there")},</p>
<p>Thank you for reaching out. We have received your enquiry and will get back to you as soon as we can.</p>
<p><strong>A quick summary of what you sent us:</strong></p>
<ul>
  <li>Interest: ${escapeHtml(interest || "(not specified)")}</li>
  <li>Phone: ${escapeHtml(phoneLine || "(not provided)")}</li>
</ul>
<p>Kind regards,<br/>${escapeHtml(this.fromName)}</p>
`.trim();

    const adminResult = await this.send({
      to: adminTos,
      subject: subjectAdmin,
      text: textAdmin,
      html: htmlAdmin,
      replyTo: email,
    });
    this.log.log(
      `sendEnquiryEmails: admin notification sent messageId=${adminResult.messageId} admins=${adminTos.join(", ")}`,
    );

    const userResult = await this.send({
      to: email,
      subject: subjectUser,
      text: textUser,
      html: htmlUser,
    });
    this.log.log(`sendEnquiryEmails: user acknowledgement sent messageId=${userResult.messageId} to=${email}`);

    this.log.log(
      `sendEnquiryEmails: complete enquirer=${email} adminMessageId=${adminResult.messageId} userMessageId=${userResult.messageId}`,
    );

    return {
      admin: { messageId: adminResult.messageId, to: adminTos },
      user: { messageId: userResult.messageId, to: email },
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Trim, strip optional surrounding quotes on whole string or each comma-separated address. */
function normalizeEnquiryAdminEmails(raw: string): string[] {
  const outer = raw.trim().replace(/^["']+|["']+$/g, "");
  if (!outer) return [];
  return outer
    .split(",")
    .map((s) => s.trim().replace(/^["']+|["']+$/g, "").toLowerCase())
    .filter(Boolean);
}

