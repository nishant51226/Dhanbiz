import crypto from "node:crypto";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { RefreshTokenEntity } from "../entities/refresh-token.entity";

export type RefreshTokenCreated = {
  refreshToken: string;
  expiresAt: Date;
};

export type RefreshTokenRotated = RefreshTokenCreated & {
  userId: string;
};

function hashRefreshToken(plain: string): string {
  return crypto.createHash("sha256").update(plain, "utf8").digest("hex");
}

function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokens: Repository<RefreshTokenEntity>,
  ) {}

  /** Default 7 days (604800s). */
  refreshTtlSec(): number {
    const explicit = Number(this.config.get("AUTH_REFRESH_TOKEN_TTL_SEC"));
    if (Number.isFinite(explicit) && explicit > 60) return Math.floor(explicit);
    const legacy = Number(this.config.get("AUTH_TOKEN_TTL_SEC"));
    if (Number.isFinite(legacy) && legacy > 60) return Math.floor(legacy);
    return 60 * 60 * 24 * 7;
  }

  async createForUser(userId: string): Promise<RefreshTokenCreated> {
    const plain = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlSec() * 1000);
    const familyId = crypto.randomUUID();
    const row = this.refreshTokens.create({
      userId,
      tokenHash: hashRefreshToken(plain),
      familyId,
      expiresAt,
      revokedAt: null,
      replacedById: null,
    });
    await this.refreshTokens.save(row);
    return { refreshToken: plain, expiresAt };
  }

  async rotate(refreshTokenPlain: string): Promise<RefreshTokenRotated | null> {
    const trimmed = String(refreshTokenPlain ?? "").trim();
    if (!trimmed) return null;
    const tokenHash = hashRefreshToken(trimmed);
    const existing = await this.refreshTokens.findOne({ where: { tokenHash } });
    if (!existing) return null;

    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      return null;
    }

    const now = new Date();
    if (existing.expiresAt.getTime() <= now.getTime()) {
      existing.revokedAt = now;
      await this.refreshTokens.save(existing);
      return null;
    }

    const plain = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlSec() * 1000);
    const newRow = this.refreshTokens.create({
      userId: existing.userId,
      tokenHash: hashRefreshToken(plain),
      familyId: existing.familyId,
      expiresAt,
      revokedAt: null,
      replacedById: null,
    });
    await this.refreshTokens.save(newRow);

    existing.revokedAt = now;
    existing.replacedById = newRow.id;
    await this.refreshTokens.save(existing);

    return { refreshToken: plain, expiresAt, userId: existing.userId };
  }

  async revoke(refreshTokenPlain: string): Promise<void> {
    const trimmed = String(refreshTokenPlain ?? "").trim();
    if (!trimmed) return;
    const tokenHash = hashRefreshToken(trimmed);
    const existing = await this.refreshTokens.findOne({ where: { tokenHash } });
    if (!existing || existing.revokedAt) return;
    existing.revokedAt = new Date();
    await this.refreshTokens.save(existing);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    const now = new Date();
    await this.refreshTokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: now },
    );
  }
}
