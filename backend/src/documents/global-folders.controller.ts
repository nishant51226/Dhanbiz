import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { FolderEntity, FolderLibraryKind } from "../entities/folder.entity";
import { AdminDefaultFolderQueryDto, SetAdminDefaultFolderDto } from "./dto/admin-default-folder.dto";
import { AdminFolderScope, CreateAdminFolderDto } from "./dto/create-admin-folder.dto";
import { CreateGlobalFolderDto } from "./dto/create-global-folder.dto";
import { GlobalFoldersService } from "./global-folders.service";

/**
 * Staff API for tenant-agnostic folder rows (`customer_id` null, `is_global` true).
 * Inserts succeed under RLS only when `app.is_admin = 1` (platform administrators).
 */
@ApiBearerAuth("bearer")
@ApiTags("folders")
@Controller("folders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("file:write")
export class GlobalFoldersController {
  constructor(private readonly globalFolders: GlobalFoldersService) {}

  @Post("global")
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
    }),
  )
  @ApiOperation({
    summary: "Create global library folder",
    description:
      "Creates `folders` row with customer_id=null, is_global=true, and library `type` (files | statements | invoices). Requires platform administrator (JWT isAdmin); RLS blocks other users.",
  })
  createGlobal(
    @Req() req: Request & { user?: AuthUser },
    @Body() body: CreateGlobalFolderDto,
  ): Promise<FolderEntity> {
    const u = req.user;
    if (!u?.isAdmin) {
      throw new ForbiddenException(
        "Only platform administrators can create global folders (matches database row-level security).",
      );
    }
    if (u.customerId) {
      throw new ForbiddenException("Customer portal sessions cannot create global folders.");
    }
    return this.globalFolders.createGlobalFolder({
      name: body.name,
      type: body.type,
      parentId: body.parentId ?? null,
    });
  }

  @Post("admin")
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
    }),
  )
  @ApiOperation({
    summary: "Create admin-scoped folder at global or customer scope",
    description:
      "Super admin helper to create folders at platform (global) or customer scope. Library kind is optional and defaults to files.",
  })
  createAdminScoped(
    @Req() req: Request & { user?: AuthUser },
    @Body() body: CreateAdminFolderDto,
  ): Promise<FolderEntity[]> {
    const u = req.user;
    if (!u?.isAdmin) {
      throw new ForbiddenException("Only platform administrators can create admin-scoped folders.");
    }
    if (u.customerId) {
      throw new ForbiddenException("Customer portal sessions cannot create admin-scoped folders.");
    }
    return this.globalFolders.createAdminFolders({
      name: body.name,
      type: body.type ?? FolderLibraryKind.files,
      scope: body.scope === AdminFolderScope.customer ? "customer" : "global",
      customerIds:
        body.scope === AdminFolderScope.customer
          ? [...new Set([...(body.customerIds ?? []), ...(body.customerId ? [body.customerId] : [])])]
          : [],
      isDefault: Boolean(body.isDefault),
      isRestricted: Boolean(body.isRestricted),
    });
  }

  @Get("admin/default-candidates")
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
    }),
  )
  @ApiOperation({
    summary: "List candidate folders for default assignment",
  })
  listDefaultCandidates(
    @Req() req: Request & { user?: AuthUser },
    @Query() query: AdminDefaultFolderQueryDto,
  ): Promise<{ id: string; name: string; isGlobal: boolean; customerId: string | null; isCurrentDefault: boolean }[]> {
    const u = req.user;
    if (!u?.isAdmin) {
      throw new ForbiddenException("Only platform administrators can manage defaults.");
    }
    if (u.customerId) {
      throw new ForbiddenException("Customer portal sessions cannot manage defaults.");
    }
    return this.globalFolders.listDefaultCandidates({
      scope: query.scope === AdminFolderScope.customer ? "customer" : "global",
      customerId: query.customerId ?? null,
    });
  }

  @Post("admin/defaults")
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
    }),
  )
  @ApiOperation({
    summary: "Set default folder by folder ID",
  })
  setDefault(
    @Req() req: Request & { user?: AuthUser },
    @Body() body: SetAdminDefaultFolderDto,
  ): Promise<{ scope: string; customerId: string | null; folderId: string }> {
    const u = req.user;
    if (!u?.isAdmin) {
      throw new ForbiddenException("Only platform administrators can manage defaults.");
    }
    if (u.customerId) {
      throw new ForbiddenException("Customer portal sessions cannot manage defaults.");
    }
    return this.globalFolders.setDefaultFolder({
      scope: body.scope === AdminFolderScope.customer ? "customer" : "global",
      customerId: body.customerId ?? null,
      folderId: body.folderId,
    });
  }

  @Get("admin/defaults")
  @ApiOperation({
    summary: "List all default folder assignments",
  })
  listDefaults(@Req() req: Request & { user?: AuthUser }): Promise<
    Array<{
      scope: "global" | "customer";
      customerId: string | null;
      customerName: string | null;
      folderId: string;
      folderName: string;
      folderIsGlobal: boolean;
    }>
  > {
    const u = req.user;
    if (!u?.isAdmin) {
      throw new ForbiddenException("Only platform administrators can manage defaults.");
    }
    if (u.customerId) {
      throw new ForbiddenException("Customer portal sessions cannot manage defaults.");
    }
    return this.globalFolders.listDefaultAssignments();
  }

  @Get("admin/restricted-candidates")
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
    }),
  )
  @ApiOperation({
    summary: "List candidate restricted folders for assignment",
  })
  listRestrictedCandidates(
    @Req() req: Request & { user?: AuthUser },
    @Query() query: AdminDefaultFolderQueryDto,
  ): Promise<
    { id: string; name: string; isGlobal: boolean; customerId: string | null; isCurrentRestricted: boolean }[]
  > {
    const u = req.user;
    if (!u?.isAdmin) {
      throw new ForbiddenException("Only platform administrators can manage restricted folders.");
    }
    if (u.customerId) {
      throw new ForbiddenException("Customer portal sessions cannot manage restricted folders.");
    }
    return this.globalFolders.listRestrictedCandidates({
      scope: query.scope === AdminFolderScope.customer ? "customer" : "global",
      customerId: query.customerId ?? null,
    });
  }

  @Post("admin/restricted")
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
    }),
  )
  @ApiOperation({
    summary: "Set restricted folder by folder ID",
  })
  setRestricted(
    @Req() req: Request & { user?: AuthUser },
    @Body() body: SetAdminDefaultFolderDto,
  ): Promise<{ scope: string; customerId: string | null; folderId: string }> {
    const u = req.user;
    if (!u?.isAdmin) {
      throw new ForbiddenException("Only platform administrators can manage restricted folders.");
    }
    if (u.customerId) {
      throw new ForbiddenException("Customer portal sessions cannot manage restricted folders.");
    }
    return this.globalFolders.setRestrictedFolder({
      scope: body.scope === AdminFolderScope.customer ? "customer" : "global",
      customerId: body.customerId ?? null,
      folderId: body.folderId,
    });
  }

  @Get("admin/restricted")
  @ApiOperation({
    summary: "List all restricted folder assignments",
  })
  listRestricted(@Req() req: Request & { user?: AuthUser }): Promise<
    Array<{
      scope: "global" | "customer";
      customerId: string | null;
      customerName: string | null;
      folderId: string;
      folderName: string;
      folderIsGlobal: boolean;
    }>
  > {
    const u = req.user;
    if (!u?.isAdmin) {
      throw new ForbiddenException("Only platform administrators can manage restricted folders.");
    }
    if (u.customerId) {
      throw new ForbiddenException("Customer portal sessions cannot manage restricted folders.");
    }
    return this.globalFolders.listRestrictedAssignments();
  }
}
