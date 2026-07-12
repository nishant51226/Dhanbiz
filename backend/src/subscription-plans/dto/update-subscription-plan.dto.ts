// backend/src/subscription-plans/dto/update-subscription-plan.dto.ts

import { PartialType } from '@nestjs/swagger';
import { CreateSubscriptionPlanDto } from './create-subscription-plan.dto';

export class UpdateSubscriptionPlanDto extends PartialType(CreateSubscriptionPlanDto) {}