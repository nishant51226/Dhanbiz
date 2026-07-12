import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import type { AuthUser } from "./auth.types";
import { DUPLICATE_USER_EMAIL_MESSAGE } from "./user-email.constants";
import { UserEntity } from "../entities/user.entity";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { RefreshTokenService } from "./refresh-token.service";

export type AuthTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type AuthTokenPayload = {
  sub: string;
  uid: string;
  cid: string | null;
  exp: number;
  typ?: string;
  adm?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthLoginResult = AuthTokenPair | "invalid_credentials" | "inactive_account";

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(CustomerUserEntity) private readonly customerUsers: Repository<CustomerUserEntity>,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  authEnabled(): boolean {
    const secret = this.config.get<string>("AUTH_SECRET");
    return Boolean(secret && secret.length >= 16);
  }

  /** Default 15 minutes (900s). */
  accessTtlSec(): number {
    const explicit = Number(this.config.get("AUTH_ACCESS_TOKEN_TTL_SEC"));
    if (Number.isFinite(explicit) && explicit > 60) return Math.floor(explicit);
    return 900;
  }

  /**
   * DB-backed login with email + password using bcrypt.
   * Returns token pair on success; `inactive_account` when the portal login is deactivated.
   */
  async loginWithEmailPassword(email: string, password: string): Promise<AuthLoginResult> {
    const secret = this.config.get<string>("AUTH_SECRET");
    if (!secret || secret.length < 16) return "invalid_credentials";
    const emailNormalized = String(email ?? "").trim().toLowerCase();
    if (emailNormalized.length === 0) return "invalid_credentials";
    const user = await this.users.findOne({
      where: { email: emailNormalized },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        customerId: true,
        isAdmin: true,
      },
    });
    if (!user) return "invalid_credentials";
    const ok = await bcrypt.compare(String(password ?? ""), user.passwordHash);
    if (!ok) return "invalid_credentials";
    if (!(await this.canUserAuthenticate(user.id, user.customerId ?? null))) {
      return "inactive_account";
    }
    const authUser = {
      userId: user.id,
      customerId: user.customerId ?? null,
      isAdmin: Boolean(user.isAdmin),
    } satisfies AuthUser;
    return this.issueTokenPair(authUser);
  }

  /**
   * Create a user with email/password (bcrypt). Returns created user id.
   */
  async createUserWithEmailPassword(params: {
    email: string;
    password: string;
    customerId?: string | null;
    phoneNumber?: string | null;
  }): Promise<{ id: string }> {
    const emailNormalized = String(params.email ?? "").trim().toLowerCase();
    if (emailNormalized.length === 0) throw new Error("Invalid email");
    const existing = await this.users.findOne({ where: { email: emailNormalized } });
    if (existing) throw new Error(DUPLICATE_USER_EMAIL_MESSAGE);
    const passwordHash = await bcrypt.hash(String(params.password ?? ""), 12);
    const user = this.users.create({
      email: emailNormalized,
      passwordHash,
      customerId: params.customerId ?? null,
      phoneNumber: params.phoneNumber ?? null,
    });
    const saved = await this.users.save(user);
    return { id: saved.id };
  }

  async tryLogin(username: string, password: string): Promise<AuthTokenPair | null> {
    if (!this.authEnabled()) return null;
    const user = this.config.get<string>("AUTH_USERNAME");
    const pass = this.config.get<string>("AUTH_PASSWORD");
    const secret = this.config.get<string>("AUTH_SECRET");
    if (!user || !pass || !secret) return null;
    if (username !== user || password !== pass) return null;
    const userId = this.config.get<string>("AUTH_USER_ID")?.trim() || "";
    if (!UUID_RE.test(userId)) return null;
    const customerIdRaw = this.config.get<string>("AUTH_CUSTOMER_ID")?.trim() || "";
    const customerId = customerIdRaw.length > 0 ? customerIdRaw : null;
    return this.issueTokenPair({ userId, customerId, isAdmin: false });
  }

  async refreshWithToken(refreshToken: string): Promise<AuthTokenPair | null> {
    const rotated = await this.refreshTokens.rotate(refreshToken);
    if (!rotated) return null;
    const user = await this.users.findOne({
      where: { id: rotated.userId },
      select: { id: true, customerId: true, isAdmin: true },
    });
    if (!user) return null;
    if (!(await this.canUserAuthenticate(user.id, user.customerId ?? null))) {
      await this.refreshTokens.revoke(refreshToken);
      return null;
    }
    const ttlSec = this.accessTtlSec();
    const accessToken = this.issueAccessToken(
      this.config.get<string>("AUTH_SECRET")!,
      ttlSec,
      {
        userId: user.id,
        customerId: user.customerId ?? null,
        isAdmin: Boolean(user.isAdmin),
      },
    );
    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: ttlSec,
    };
  }

  async logoutRefreshToken(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken?.trim()) return;
    await this.refreshTokens.revoke(refreshToken);
  }

  verifyToken(token: string): boolean {
    return this.readAuthUser(token) !== null;
  }

  readAuthUser(token: string): AuthUser | null {
    const secret = this.config.get<string>("AUTH_SECRET");
    if (!secret) return null;
    const payload = verifyTokenRaw(token, secret);
    if (!payload) return null;
    if (payload.typ !== undefined && payload.typ !== "access") return null;
    return { userId: payload.uid, customerId: payload.cid, isAdmin: Boolean(payload.adm) };
  }

  /**
   * Portal logins (`users.customer_id` set) must have an active `customer_users` row for that tenant.
   * Practice staff and superadmin accounts are not gated by `customer_users.is_active`.
   */
  async canUserAuthenticate(userId: string, customerId: string | null): Promise<boolean> {
    const uid = String(userId ?? "").trim();
    if (!uid) return false;
    const cid = customerId?.trim();
    if (!cid) return true;
    const link = await this.customerUsers.findOne({
      where: { userId: uid, customerId: cid },
      select: { isActive: true },
    });
    return Boolean(link?.isActive);
  }

  async assertUserMayUseAccessToken(user: AuthUser): Promise<boolean> {
    return this.canUserAuthenticate(user.userId, user.customerId);
  }

  async issueTokenPair(user: AuthUser): Promise<AuthTokenPair> {
    const secret = this.config.get<string>("AUTH_SECRET");
    if (!secret) throw new Error("AUTH_SECRET not configured");
    const ttlSec = this.accessTtlSec();
    const accessToken = this.issueAccessToken(secret, ttlSec, user);
    const { refreshToken } = await this.refreshTokens.createForUser(user.userId);
    return { accessToken, refreshToken, expiresIn: ttlSec };
  }

  private issueAccessToken(secret: string, ttlSec: number, user: AuthUser): string {
    const header = b64urlJson({ alg: "HS256", typ: "JWT" });
    const payload = b64urlJson({
      sub: "docp",
      typ: "access",
      uid: user.userId,
      cid: user.customerId,
      exp: Math.floor(Date.now() / 1000) + ttlSec,
      ...(user.isAdmin ? { adm: true } : {}),
    });
    const sig = crypto
      .createHmac("sha256", secret)
      .update(`${header}.${payload}`)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `${header}.${payload}.${sig}`;
  }
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function verifyTokenRaw(token: string, secret: string): AuthTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${h}.${p}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (expected.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Partial<AuthTokenPayload>;
    if (
      typeof payload.exp !== "number" ||
      payload.exp < Math.floor(Date.now() / 1000) ||
      typeof payload.uid !== "string" ||
      payload.uid.length === 0 ||
      (payload.cid !== null && payload.cid !== undefined && typeof payload.cid !== "string")
    ) {
      return null;
    }
    return {
      sub: typeof payload.sub === "string" ? payload.sub : "docp",
      uid: payload.uid,
      cid: payload.cid ?? null,
      exp: payload.exp,
      typ: typeof payload.typ === "string" ? payload.typ : undefined,
      adm: payload.adm === true,
    };
  } catch {
    return null;
  }
}
