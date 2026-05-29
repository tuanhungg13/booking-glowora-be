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
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../common/constants/permissions';
import { CreateStoreDto } from './dto/create-store.dto';
import { StoreFilterDto } from './dto/store-filter.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UpdateWorkingHoursDto } from './dto/update-working-hours.dto';
import { StoresService } from './stores.service';
import { TelegramService } from '../../telegram/telegram.service';

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

  @ApiOperation({ summary: 'All shops current user belongs to with role (flat)' })
  @ApiBearerAuth()
  @Get('my-shops')
  findMyShops(@CurrentUser() user: CurrentUserPayload) {
    return this.storesService.findMyShops(user.id);
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
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file', { storage: imageStorage('logos') }))
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.storesService.uploadLogo(id, user.id, `/uploads/logos/${file.filename}`);
  }

  @ApiOperation({ summary: 'Upload store banner' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Post(':id/banner')
  @UseInterceptors(FileInterceptor('file', { storage: imageStorage('banners') }))
  uploadBanner(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.storesService.uploadBanner(id, user.id, `/uploads/banners/${file.filename}`);
  }

  @ApiOperation({ summary: 'Generate a one-time Telegram group setup link (valid 10 min)' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Post(':id/telegram/setup-link')
  async generateTelegramSetupLink(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.storesService.checkOwnership(id, user.id);
    const url = await this.telegramService.generateStoreSetupUrl(id);
    if (!url) throw new BadRequestException('TELEGRAM_BOT_USERNAME chưa được cấu hình');
    return { url };
  }

  @ApiOperation({ summary: 'Link a Telegram supergroup (forum) to this store' })
  @ApiBearerAuth()
  @RequirePermissions(Permissions.STORE.UPDATE)
  @Patch(':id/telegram-group')
  linkTelegramGroup(
    @Param('id') id: string,
    @Body() body: { telegramGroupId: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.storesService.linkTelegramGroup(id, user.id, body.telegramGroupId);
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
}
