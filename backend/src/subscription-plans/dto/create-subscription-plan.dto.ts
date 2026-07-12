// backend/src/subscription-plans/dto/create-subscription-plan.dto.ts

import { IsString, IsOptional, IsNumber, IsBoolean, IsObject, IsNotEmpty } from 'class-validator';

export class CreateSubscriptionPlanDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  billing_cycle?: string;

  @IsObject()
  @IsOptional()
  features?: Record<string, unknown>;

  @IsNumber()
  @IsOptional()
  turnoverMinGbp?: number;

  @IsNumber()
  @IsOptional()
  turnoverMaxGbp?: number | null;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}