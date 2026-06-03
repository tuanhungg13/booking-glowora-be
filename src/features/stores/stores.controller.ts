import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { LogStatus, LogType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { diskStorage } from 'multer';
import { extname } from 'path';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { Permissions } from '../../common/constants/permissions';
import { CreateStoreDto } from './dto/create-store.dto';
import { StoreFilterDto } from './dto/store-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UpdateWorkingHoursDto } from './dto/update-working-hours.dto';
import { UpsertPaymentConfigDto } from './dto/upsert-payment-config.dto';
import { StoresService } from './stores.service';
import { TelegramService } from '../../telegram/telegram.service';
import { SystemLogService } from '../../system-log/system-log.service';

class StoreOwnerLogFilterDto {
  @ApiPropertyOptional({ enum: LogType })
  @IsOptional()
  @IsEnum(LogType)
  type?: LogType;

  @ApiPropertyOptional({ enum: LogStatus })
  @IsOptional()
  @IsEnum(LogStatus)
  status?: LogStatus;

  @ApiPropertyOptional({ description: 'Tìm theo tên hoặc email người thực hiện' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID người thực hiện (actorId)' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

const imageStorage = (folder: string) =>
  diskStorage({
    destination: `./uploads/${folder}`,
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly telegramService: TelegramService,
    private readonly systemLogService: SystemLogService,
  ) {}

  @ApiOperation({ summary: 'Public listing for active stores' })
  @Public()
  @Get()
  findAll(@Query() filter: StoreFilterDto) {
    return this.storesService.findAll(filter);
  }

  @ApiOperation({ summary: 'Create a store for current owner' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.CREATE)
  @AuditLog({ type: LogType.STORE_CREATED, targetType: 'Store' })
  @Post()
  create(@Body() dto: CreateStoreDto, @CurrentUser() user: CurrentUserPayload) {
    return this.storesService.create(dto, user.id);
  }

  @ApiOperation({ summary: 'Stores owned by current user' })
  @ApiBearerAuth()
  @Get('mine')
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.storesService.findMine(user.id);
  }

  @ApiOperation({
    summary: 'All stores current user belongs to with role (flat)',
  })
  @ApiBearerAuth()
  @Get('my-stores')
  findMyStores(@CurrentUser() user: CurrentUserPayload) {
    return this.storesService.findMyStores(user.id);
  }

  @ApiOperation({ summary: 'Nhật ký hoạt động cửa hàng (chỉ owner)' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.LOG.VIEW_SHOP)
  @Get(':id/logs')
  getStoreLogs(@Param('id') id: string, @Query() filter: StoreOwnerLogFilterDto) {
    return this.systemLogService.findAll({ ...filter, storeId: id });
  }

  @ApiOperation({ summary: 'Public store detail by id or slug' })
  @Public()
  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.storesService.findOne(idOrSlug);
  }

  @ApiOperation({ summary: 'Update current owner store' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storesService.update(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Upload store logo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'File ảnh logo' },
      },
      required: ['file'],
    },
  })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file', { storage: imageStorage('logos') }))
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.storesService.uploadLogo(
      id,
      user.id,
      `/uploads/logos/${file.filename}`,
    );
  }

  @ApiOperation({ summary: 'Upload store banner' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'File ảnh banner' },
      },
      required: ['file'],
    },
  })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Post(':id/banner')
  @UseInterceptors(
    FileInterceptor('file', { storage: imageStorage('banners') }),
  )
  uploadBanner(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.storesService.uploadBanner(
      id,
      user.id,
      `/uploads/banners/${file.filename}`,
    );
  }

  @ApiOperation({
    summary: 'Generate a one-time Telegram group setup link (valid 10 min)',
  })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Post(':id/telegram/setup-link')
  async generateTelegramSetupLink(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.storesService.checkOwnership(id, user.id);
    const url = await this.telegramService.generateStoreSetupUrl(id);
    if (!url)
      throw new BadRequestException('TELEGRAM_BOT_USERNAME chưa được cấu hình');
    return { url };
  }

  @ApiOperation({ summary: 'Link a Telegram supergroup (forum) to this store' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        telegramGroupId: { type: 'string', example: '-1001234567890', description: 'Telegram supergroup chat ID' },
      },
      required: ['telegramGroupId'],
    },
  })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Patch(':id/telegram-group')
  linkTelegramGroup(
    @Param('id') id: string,
    @Body() body: { telegramGroupId: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storesService.linkTelegramGroup(
      id,
      user.id,
      body.telegramGroupId,
    );
  }

  @ApiOperation({ summary: 'Unlink Telegram group from this store' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Delete(':id/telegram-group')
  unlinkTelegramGroup(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storesService.linkTelegramGroup(id, user.id, null);
  }

  @ApiOperation({ summary: 'Replace working hours for current owner store' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.WORKING_HOUR.UPDATE)
  @Put(':id/working-hours')
  updateWorkingHours(
    @Param('id') id: string,
    @Body() dto: UpdateWorkingHoursDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storesService.updateWorkingHours(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Lấy cấu hình thanh toán chuyển khoản của shop (chỉ owner)' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Get(':id/payment-config')
  getPaymentConfig(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storesService.getPaymentConfig(id, user.id);
  }

  @ApiOperation({ summary: 'Cấu hình/cập nhật thông tin tài khoản ngân hàng nhận tiền (chỉ owner)' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Put(':id/payment-config')
  upsertPaymentConfig(
    @Param('id') id: string,
    @Body() dto: UpsertPaymentConfigDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storesService.upsertPaymentConfig(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Xóa cấu hình thanh toán của shop (chỉ owner)' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Delete(':id/payment-config')
  deletePaymentConfig(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storesService.deletePaymentConfig(id, user.id);
  }
}
