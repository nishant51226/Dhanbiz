import { BadRequestException, Body, Controller, Logger, Post, UsePipes, ValidationPipe } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { EnquiryMailService } from "../enquiry/enquiry-mail.service";
import { RegisterDto } from "./dto/register.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthRegisterController {
  private readonly log = new Logger(AuthRegisterController.name);

  constructor(private readonly enquiryMail: EnquiryMailService) {}

  @Post("register")
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  )
  @ApiOperation({ summary: "Submit enquiry (sends admin + user acknowledgement emails; no account created)" })
  @ApiBody({ type: RegisterDto })
  async register(@Body() body: RegisterDto) {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) {
      throw new BadRequestException("Email is required.");
    }

    const countryCode = (body.country_code ?? body.phoneCountryCode ?? "").trim();
    this.log.log(`Register: persist enquiry + mail for email=${email}`);

    const { id: enquiryId, enquiryEmailSent } = await this.enquiryMail.persistAndSendEmails({
      email,
      fullName: body.fullName.trim(),
      interest: body.interest.trim(),
      phone: body.phone.trim(),
      countryCode,
    });

    return {
      enquiryId,
      fullName: body.fullName.trim(),
      interest: body.interest.trim(),
      enquiryEmailSent,
    };
  }
}
