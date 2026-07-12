import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CrudRequest, GetManyDefaultResponse } from "@nestjsx/crud";
import { TypeOrmCrudService } from "@nestjsx/crud-typeorm";
import { DeepPartial, In, Repository } from "typeorm";
import {
  LEGACY_INVOICE_JOB_STAGING_META_KEY,
  LEGACY_INVOICE_PORTAL_JOB_FILE_META_KEY,
  PORTAL_JOB_FILE_META_KEY,
  PORTAL_JOB_STAGING_META_KEY,
} from "../customer-portal/portal-staging.constants";
import { File, FileType } from "../entities/file.entity";
import { Job, JobStatus } from "../entities/job.entity";
import { QueueService } from "../queue/queue.service";

@Injectable()
export class FilesService extends TypeOrmCrudService<File> {
  constructor(
    @InjectRepository(File) repo: Repository<File>,
    private readonly queue: QueueService,
  ) {
    super(repo);
  }

  /** Hide portal extraction staging rows from drive / `GET /api/files` listings. */
  private hideFromDriveList(f: File): boolean {
    return (
      f.metadata?.[PORTAL_JOB_STAGING_META_KEY] === true ||
      f.metadata?.[PORTAL_JOB_FILE_META_KEY] === true ||
      f.metadata?.[LEGACY_INVOICE_JOB_STAGING_META_KEY] === true ||
      f.metadata?.[LEGACY_INVOICE_PORTAL_JOB_FILE_META_KEY] === true
    );
  }

  async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<File> | File[]> {
    const res = await super.getMany(req);
    if (Array.isArray(res)) {
      return res.filter((f) => !this.hideFromDriveList(f));
    }
    const data = res.data.filter((f) => !this.hideFromDriveList(f));
    return {
      ...res,
      data,
      count: data.length,
    };
  }

  async createOne(req: CrudRequest, dto: DeepPartial<File>): Promise<File> {
    await this.validateTree(dto, undefined);
    return super.createOne(req, dto);
  }

  async updateOne(req: CrudRequest, dto: DeepPartial<File>): Promise<File> {
    const existing = await this.getOneOrFail(req);
    await this.validateTree(dto, existing);
    return super.updateOne(req, dto);
  }

  /** Soft-delete by id (used when removing a linked library document row). */
  async softDeleteById(fileId: string): Promise<void> {
    const file = await this.repo.findOne({ where: { id: fileId } });
    if (!file) return;
    await this.softDeleteTree(file);
  }

  /** Soft-delete a file or folder (and descendants); linked extraction jobs are soft-deleted too. */
  async deleteOne(req: CrudRequest): Promise<void> {
    const file = await this.getOneOrFail(req);
    await this.softDeleteTree(file);
  }

  private async softDeleteTree(file: File): Promise<void> {
    if (file.fileType === FileType.folder) {
      const children = await this.repo.find({
        where: { parentId: file.id, customerId: file.customerId },
      });
      for (const child of children) {
        await this.softDeleteTree(child);
      }
    }
    await this.softDeleteJobsForFile(file.id);
    await this.repo.softDelete(file.id);
  }

  private async softDeleteJobsForFile(fileId: string): Promise<void> {
    const jobRepo = this.repo.manager.getRepository(Job);
    const jobs = await jobRepo.find({ where: { fileId } });
    if (jobs.length === 0) return;

    for (const job of jobs) {
      if (job.status === JobStatus.queued || job.status === JobStatus.processing) {
        try {
          await this.queue.cancelJob(job.id);
        } catch {
          /* job may already be terminal */
        }
      }
    }

    await jobRepo.softDelete({ id: In(jobs.map((j) => j.id)) });
  }

  private async validateTree(
    dto: DeepPartial<File>,
    existing?: File
  ): Promise<void> {
    const customerId = dto.customerId ?? existing?.customerId;
    if (!customerId) {
      throw new BadRequestException("customerId is required");
    }
    const parentId = dto.parentId !== undefined ? dto.parentId : existing?.parentId;
    if (parentId) {
      const parent = await this.repo.findOne({ where: { id: parentId as string } });
      if (!parent) {
        throw new NotFoundException("parent not found");
      }
      if (parent.customerId !== customerId) {
        throw new BadRequestException("parent belongs to another customer");
      }
      if (parent.fileType !== FileType.folder) {
        throw new BadRequestException("parent must be a folder");
      }
    }
    const fileType = dto.fileType ?? existing?.fileType;
    if (fileType === FileType.file) {
      const p = dto.storageRelativePath ?? existing?.storageRelativePath;
      if (!p) {
        throw new BadRequestException(
          "file rows require storageRelativePath (use upload API for binaries)"
        );
      }
    }
  }
}
