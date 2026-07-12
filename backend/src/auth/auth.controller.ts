import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService, type AuthTokenPair } from "./auth.service";
import type { AuthUser } from "./auth.types";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { SignupDto } from "./dto/signup.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PermissionsService } from "./permissions.service";
import { Customer, CustomerAccountStatus } from "../entities/customer.entity";

type AuthedRequest = Request & { user?: AuthUser };

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly permissions: PermissionsService,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
  ) {}

  private tokenPairResponse(pair: AuthTokenPair) {
    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: pair.expiresIn,
      token: pair.accessToken,
    };
  }

  /** Portal sessions include organisation name and lifecycle status; staff/admin use empty strings / null. */
  private async customerContextForMe(
    user: AuthUser,
  ): Promise<{ name: string; accountStatus: CustomerAccountStatus | null; createdAt: string | null }> {
    if (user.isAdmin) return { name: "", accountStatus: null, createdAt: null };
    const cid = user.customerId?.trim();
    if (!cid) return { name: "", accountStatus: null, createdAt: null };
    const row = await this.customers.findOne({
      where: { id: cid },
      select: { name: true, accountStatus: true, createdAt: true },
    });
    return {
      name: row?.name?.trim() ?? "",
      accountStatus: row?.accountStatus ?? null,
      createdAt: row?.createdAt?.toISOString?.() ?? null,
    };
  }

  @Get("status")
  @ApiOperation({ summary: "Whether the API expects authentication" })
  status() {
    return { authRequired: this.auth.authEnabled() };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary:
      "Current user + effective permission keys (for UI routing). Admins get `isAdmin: true` and empty `permissions` (treat as full access). `customer_name` is the organisation name for portal JWTs and an empty string for staff/admin. Portal JWTs also include `customer_account_status` and `customer_created_at`.",
  })
  async me(@Req() req: AuthedRequest) {
    if (!this.auth.authEnabled()) {
      return {
        userId: "",
        customerId: null as string | null,
        customer_name: "",
        isAdmin: true,
        permissions: [] as string[],
        roles: ["superadmin"] as string[],
      };
    }
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.isAdmin) {
      return {
        userId: user.userId,
        customerId: user.customerId,
        customer_name: "",
        isAdmin: true,
        permissions: [] as string[],
        roles: ["superadmin"] as string[],
      };
    }
    const permissions = await this.permissions.listEffectivePermissions(user.userId);
    const roles = await this.permissions.listEffectiveRoleNames(user.userId);
    const customerCtx = await this.customerContextForMe(user);
    return {
      userId: user.userId,
      customerId: user.customerId,
      customer_name: customerCtx.name,
      customer_account_status: customerCtx.accountStatus,
      customer_created_at: customerCtx.createdAt,
      isAdmin: false,
      permissions,
      roles,
    };
  }

  @Post("login")
  @ApiOperation({
    summary: "Login (email/password or legacy username/password)",
    description: "Returns short-lived access JWT and opaque refresh token.",
  })
  @ApiBody({ type: LoginDto })
  async login(@Body() body: LoginDto) {
    if (!this.auth.authEnabled()) {
      return { token: null, authRequired: false };
    }
    if (body?.email && body?.password) {
      const result = await this.auth.loginWithEmailPassword(String(body.email), String(body.password));
      if (result === "inactive_account") {
        throw new UnauthorizedException("This account has been deactivated");
      }
      if (result !== "invalid_credentials") {
        return this.tokenPairResponse(result);
      }
    }
    const pair = await this.auth.tryLogin(String(body?.username ?? ""), String(body?.password ?? ""));
    if (!pair) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.tokenPairResponse(pair);
  }

  @Post("refresh")
  @ApiOperation({ summary: "Rotate refresh token and issue a new access token" })
  @ApiBody({ type: RefreshDto })
  async refresh(@Body() body: RefreshDto) {
    if (!this.auth.authEnabled()) {
      throw new UnauthorizedException("Auth disabled");
    }
    const refreshToken = String(body?.refreshToken ?? "").trim();
    if (!refreshToken) {
      throw new BadRequestException("Missing refreshToken");
    }
    const pair = await this.auth.refreshWithToken(refreshToken);
    if (!pair) {
      throw new UnauthorizedException("Invalid, expired, or deactivated session");
    }
    return this.tokenPairResponse(pair);
  }

  @Post("logout")
  @HttpCode(204)
  @ApiOperation({ summary: "Revoke refresh token for this session" })
  @ApiBody({ type: LogoutDto })
  async logout(@Body() body: LogoutDto) {
    await this.auth.logoutRefreshToken(body?.refreshToken);
  }

  @Post("signup")
  @ApiOperation({ summary: "Create a user (email + password)" })
  @ApiBody({ type: SignupDto })
  async signup(@Body() body: SignupDto) {
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (!email || !password) throw new BadRequestException("Missing fields");
    // Simple password floor; adjust as needed
    if (password.length < 8) throw new BadRequestException("Password too short");

    try {
      const created = await this.auth.createUserWithEmailPassword({
        email,
        password,
        customerId: body?.customerId ? String(body.customerId) : null,
        phoneNumber: body?.phoneNumber ? String(body.phoneNumber) : null,
      });
      return { id: created.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Signup failed";
      throw new BadRequestException(msg);
    }
  }
}
