import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Per-field prefill + lock; see submitter `fields` on POST /submissions. */
export type DocusealSubmitterFieldInput = {
  name: string;
  default_value: string | number | boolean | null;
  readonly?: boolean;
};

export type DocusealCreateSubmitterInput = {
  email: string;
  role: string;
  name?: string;
  external_id?: string;
  values?: Record<string, string | number | boolean>;
  fields?: DocusealSubmitterFieldInput[];
};

@Injectable()
export class DocusealApiService {
  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    const u = this.config.get<string>("DOCUSEAL_API_BASE_URL")?.trim();
    return u && u.length > 0 ? u.replace(/\/+$/, "") : "https://api.docuseal.com";
  }

  /**
   * POST /submissions  creates a submission and sends invitation emails when send_email is true.
   * @see https://www.docuseal.com/docs/api
   */
  /**
   * GET /templates/{id}  field names for filtering submitter `fields` (DocuSeal rejects unknown names in `fields`).
   */
  async getTemplate(templateId: number): Promise<unknown> {
    const apiKey = this.config.get<string>("DOCUSEAL_API_KEY")?.trim();
    if (!apiKey) {
      throw new BadGatewayException("DOCUSEAL_API_KEY is not configured");
    }
    const res = await fetch(`${this.baseUrl()}/templates/${templateId}`, {
      method: "GET",
      headers: { "X-Auth-Token": apiKey },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new BadGatewayException(`DocuSeal API error (${res.status}): ${text.slice(0, 2000)}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BadGatewayException("DocuSeal API returned non-JSON");
    }
  }

  async createSubmission(params: {
    templateId: number;
    submitters: DocusealCreateSubmitterInput[];
    sendEmail?: boolean;
    order?: "preserved" | "random";
  }): Promise<unknown> {
    const apiKey = this.config.get<string>("DOCUSEAL_API_KEY")?.trim();
    if (!apiKey) {
      throw new BadGatewayException("DOCUSEAL_API_KEY is not configured");
    }
    const body = {
      template_id: params.templateId,
      send_email: params.sendEmail !== false,
      order: params.order ?? "random",
      submitters: params.submitters.map((s) => ({
        email: s.email,
        role: s.role,
        ...(s.name ? { name: s.name } : {}),
        ...(s.external_id ? { external_id: s.external_id } : {}),
        ...(s.values && Object.keys(s.values).length > 0 ? { values: s.values } : {}),
        ...(s.fields && s.fields.length > 0 ? { fields: s.fields } : {}),
      })),
    };
    const res = await fetch(`${this.baseUrl()}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": apiKey,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = `DocuSeal API error (${res.status}): ${text.slice(0, 2000)}`;
      if (
        res.status === 422 &&
        /unknown submitter role/i.test(text)
      ) {
        msg +=
          " Use a role string that exactly matches the template (set DOCUSEAL_DEFAULT_SUBMITTER_ROLE or pass role on signature-email-request).";
      }
      throw new BadGatewayException(msg);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BadGatewayException("DocuSeal API returned non-JSON");
    }
  }
}
