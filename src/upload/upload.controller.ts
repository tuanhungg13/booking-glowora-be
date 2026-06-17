import { BadRequestException, Controller, Post, Query, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Permissions } from '../common/constants/permissions';
import { StoreId } from '../common/decorators/store-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @ApiOperation({ summary: 'Upload ảnh đại diện cho user đang đăng nhập' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadAvatar(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Không có ảnh nào được tải lên');
    const url = await this.cloudinary.uploadImage(file, `glowora/avatars/${user.id}`);
    return { url };
  }

  @ApiOperation({ summary: 'Upload file cho chat (ảnh max 8MB, video max 50MB, tối đa 3 ảnh hoặc 1 video)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'Tối đa 3 ảnh hoặc 1 video' },
      },
      required: ['files'],
    },
  })
  @Post('chat')
  @UseInterceptors(FilesInterceptor('files', 3, { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadChatFiles(
    @CurrentUser() _user: CurrentUserPayload,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Không có file nào được tải lên');

    const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const ALLOWED_VIDEOS = ['video/mp4', 'video/webm', 'video/quicktime'];
    const IMAGE_MAX = 8 * 1024 * 1024;
    const VIDEO_MAX = 50 * 1024 * 1024;

    for (const f of files) {
      if (!ALLOWED_IMAGES.includes(f.mimetype) && !ALLOWED_VIDEOS.includes(f.mimetype)) {
        throw new BadRequestException(`Loại file không hỗ trợ: ${f.mimetype}`);
      }
    }

    const hasVideo = files.some((f) => ALLOWED_VIDEOS.includes(f.mimetype));
    const hasImage = files.some((f) => ALLOWED_IMAGES.includes(f.mimetype));

    if (hasVideo && hasImage) throw new BadRequestException('Không thể gửi ảnh và video cùng lúc');
    if (hasVideo && files.length > 1) throw new BadRequestException('Chỉ được gửi tối đa 1 video');
    if (hasImage && files.length > 3) throw new BadRequestException('Chỉ được gửi tối đa 3 ảnh');

    for (const f of files) {
      if (ALLOWED_IMAGES.includes(f.mimetype) && f.size > IMAGE_MAX) {
        throw new BadRequestException(`Ảnh "${f.originalname}" vượt quá 8MB`);
      }
      if (ALLOWED_VIDEOS.includes(f.mimetype) && f.size > VIDEO_MAX) {
        throw new BadRequestException(`Video "${f.originalname}" vượt quá 50MB`);
      }
    }

    const attachments = await Promise.all(
      files.map(async (f) => {
        const isVideo = ALLOWED_VIDEOS.includes(f.mimetype);
        const result = await this.cloudinary.uploadFile(f, 'glowora/chat', isVideo ? 'video' : 'image');
        return {
          type: isVideo ? 'video' : 'image',
          url: result.url,
          publicId: result.publicId,
          fileName: f.originalname,
          fileSize: f.size,
          mimeType: f.mimetype,
          width: result.width,
          height: result.height,
          duration: result.duration,
        };
      }),
    );

    return { attachments };
  }

  @ApiOperation({ summary: 'Upload ảnh danh mục hệ thống (admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @Post('category')
  @RequirePermissions(Permissions.CATEGORY.UPDATE)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadCategoryImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Không có ảnh nào được tải lên');
    const url = await this.cloudinary.uploadImage(file, 'glowora/categories');
    return { url };
  }

  @ApiOperation({ summary: 'Upload nhiều ảnh, trả về danh sách URL. type: services | store' })
  @ApiHeader({ name: 'x-store-id', description: 'ID của store', required: true })
  @ApiQuery({ name: 'type', enum: ['services', 'store'], description: 'Loại ảnh (xác định thư mục lưu trữ)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Tối đa 10 ảnh',
        },
      },
      required: ['files'],
    },
  })
  @Post()
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  async uploadImages(
    @StoreId() storeId: string,
    @Query('type') type: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Không có ảnh nào được tải lên');
    if (type !== 'services' && type !== 'store') {
      throw new BadRequestException('type phải là "services" hoặc "store"');
    }
    const folder = `glowora/${storeId}/${type}`;
    const urls = await Promise.all(files.map((f) => this.cloudinary.uploadImage(f, folder)));
    return { urls };
  }
}
