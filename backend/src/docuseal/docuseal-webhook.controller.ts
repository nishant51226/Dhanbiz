import { Body, Controller, Get, Head, Post } from "@nestjs/common";
import { DocusealWebhookService } from "./docuseal-webhook.service";

@Controller("webhooks/docuseal")
export class DocusealWebhookController {
  constructor(private readonly webhooks: DocusealWebhookService) {}

  /** Lets you open the URL in a browser; real deliveries use POST + secret header. */
  @Get()
  probe() {
    return {
      ok: true,
      message:
        "DocuSeal webhook URL is registered. DocuSeal must POST JSON here with the configured secret header (not a browser GET).",
    };
  }

  @Head()
  probeHead() {
    return;
  }

  @Post()
  receive(@Body() body: unknown) {
    return this.webhooks.handlePayload(body);
  }
}
