import { Body, Controller, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { Crud, CrudController, CrudRequest, Override, ParsedRequest } from "@nestjsx/crud";
import type { Request } from "express";
import type { DeepPartial } from "typeorm";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionResource } from "../auth/permission-resource.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { PermissionsService } from "../auth/permissions.service";
import { RequirePermission } from "../auth/require-permission.decorator";
import { File, FileType } from "../entities/file.entity";
import { assertCanCreateCustomerFolder } from "./customer-folder-create.policy";
import { assertCanDeleteDriveFiles } from "./file-delete.policy";
import { FilesService } from "./files.service";

@ApiBearerAuth("bearer")
@Crud({
  model: { type: File },
  params: {
    id: {
      field: "id",
      type: "uuid",
      primary: true,
    },
  },
  routes: {
    deleteOneBase: {
      decorators: [RequirePermission("file:delete")],
    },
  },
})
@Controller("files")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@PermissionResource("file")
export class FilesController implements CrudController<File> {
  constructor(
    public service: FilesService,
    private readonly permissions: PermissionsService,
  ) {}

  @Override("createOneBase")
  createOne(
    @ParsedRequest() req: CrudRequest,
    @Body() dto: DeepPartial<File>,
    @Req() httpReq: Request & { user?: AuthUser },
  ) {
    if (dto.fileType === FileType.folder) {
      assertCanCreateCustomerFolder(httpReq.user);
    }
    return this.service.createOne(req, dto);
  }

  @Override("deleteOneBase")
  async deleteOne(
    @ParsedRequest() req: CrudRequest,
    @Req() httpReq: Request & { user?: AuthUser },
  ) {
    await assertCanDeleteDriveFiles(httpReq.user, this.permissions);
    return this.service.deleteOne(req);
  }
}
