import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EnquiryModule } from "../enquiry/enquiry.module";
import { Customer } from "../entities/customer.entity";
import { RoleEntity } from "../entities/role.entity";
import { UserEntity } from "../entities/user.entity";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { RefreshTokenEntity } from "../entities/refresh-token.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import { AuthController } from "./auth.controller";
import { AuthRegisterController } from "./auth-register.controller";
import { AuthService } from "./auth.service";
import { RefreshTokenService } from "./refresh-token.service";
import { PermissionsService } from "./permissions.service";
import { PermissionsGuard } from "./permissions.guard";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, UserRoleEntity, UserEntity, CustomerUserEntity, Customer, RefreshTokenEntity]),
    EnquiryModule,
  ],
  controllers: [AuthController, AuthRegisterController],
  providers: [AuthService, RefreshTokenService, PermissionsService, PermissionsGuard, JwtAuthGuard],
  exports: [AuthService, PermissionsService, PermissionsGuard, JwtAuthGuard],
})
export class AuthModule {}
