import { HttpException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EnquiryUserEntity } from "../entities/enquiry-user.entity";
import { MailService } from "../mail/mail.service";

export type EnquiryPersistAndMailParams = {
  email: string;
  fullName: string;
  interest: string;
  phone: string;
  countryCode: string;
};

@Injectable()
export class EnquiryMailService {
  private readonly log = new Logger(EnquiryMailService.name);

  constructor(
    @InjectRepository(EnquiryUserEntity)
    private readonly enquiryUsers: Repository<EnquiryUserEntity>,
    private readonly mail: MailService,
  ) {}

  /**
   * Saves the enquiry row, then attempts admin + acknowledgement emails (same as {@link MailService.sendEnquiryEmails}).
   * Persists even when mail is disabled or sending fails; {@link enquiryEmailSent} reflects outbound mail only.
   */
  async persistAndSendEmails(params: EnquiryPersistAndMailParams): Promise<{
    id: string;
    enquiryEmailSent: boolean;
  }> {
    const email = params.email.trim().toLowerCase();
    const fullName = params.fullName.trim();
    const interest = params.interest.trim();
    const phone = params.phone.trim();
    const countryCode = params.countryCode.trim();
    console.log("params", params);
    const row = this.enquiryUsers.create({
      email,
      fullName,
      interest,
      phone,
      countryCode,
    });
    const saved = await this.enquiryUsers.save(row);
    this.log.log(`Enquiry persisted id=${saved.id} email=${email}`);

    let enquiryEmailSent = false;
    if (!this.mail.isEnabled()) {
      this.log.warn(`Enquiry id=${saved.id}: mail disabled; skipping notification emails.`);
      return { id: saved.id, enquiryEmailSent };
    }

    try {
      await this.mail.sendEnquiryEmails({
        email,
        fullName,
        interest,
        phone,
        ...(countryCode ? { phoneCountryCode: countryCode } : {}),
      });
      enquiryEmailSent = true;
      this.log.log(`Enquiry id=${saved.id}: notification emails sent OK`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = err instanceof HttpException ? err.getStatus() : undefined;
      this.log.warn(`Enquiry id=${saved.id}: notification emails FAILED status=${status ?? "n/a"}: ${msg}`);
      if (err instanceof Error && err.stack) {
        this.log.warn(`Enquiry id=${saved.id}: stack ${err.stack.slice(0, 2000)}`);
      }
    }

    return { id: saved.id, enquiryEmailSent };
  }
}
