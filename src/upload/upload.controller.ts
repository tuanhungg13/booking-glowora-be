import { BadRequestException, Controller, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Permissions } from '../common/constants/permissions';
import { StoreId } from '../common/decorators/store-id.decorator';

@ApiTags('upload')
@ApiHeader({ name: 'x-store-id', description: 'ID của store', required: true })
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly cloudinary: CloudinaryService) {}

  @ApiOperation({ summary: 'Upload nhiều ảnh, trả về danh sách URL. type: services | store' })
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
