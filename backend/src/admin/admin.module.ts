import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { CustomersModule } from "../customers/customers.module.js";
import { RoleEntity } from "../entities/role.entity";
import { StaffCustomerAssignmentEntity } from "../entities/staff-customer-assignment.entity";
import { UserEntity } from "../entities/user.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import { Customer } from "../entities/customer.entity";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { AdminGuard } from "./admin.guard";
import { AdminOrPortalUserWriteGuard } from "./admin-or-portal-user-write.guard";
import { AdminRolesController } from "./admin-roles.controller";
import { AdminRolesService } from "./admin-roles.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";

@Module({
  imports: [
    AuthModule,
    CustomersModule,
    TypeOrmModule.forFeature([
      RoleEntity,
      UserRoleEntity,
      UserEntity,
      Customer,
      CustomerUserEntity,
      StaffCustomerAssignmentEntity,
    ]),
  ],
  controllers: [AdminRolesController, AdminUsersController],
  providers: [AdminRolesService, AdminUsersService, AdminGuard, AdminOrPortalUserWriteGuard],
})
export class AdminModule {}
