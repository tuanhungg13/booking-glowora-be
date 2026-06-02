import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { RemoveServiceImageDto } from './dto/service-image.dto';
import { CreateServiceVariantDto, UpdateServiceVariantDto } from './dto/service-variant.dto';
import { PublicServiceQueryDto, ServiceQueryDto } from './dto/service-filter.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { StoreId } from '../../../common/decorators/store-id.decorator';

@ApiTags('services')
@ApiHeader({ name: 'x-store-id', description: 'ID của store', required: true })
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) { }

  @ApiOperation({ summary: 'Tạo dịch vụ mới' })
  @ApiBearerAuth()
  @Post()
  @RequirePermissions(Permissions.SERVICE.CREATE)
  create(@StoreId() storeId: string, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(storeId, dto);
  }

  @ApiOperation({ summary: 'Khám phá dịch vụ công khai từ nhiều store (public)' })
  @Public()
  @Get('explore')
  findPublic(@Query() query: PublicServiceQueryDto) {
    return this.servicesService.findPublic(query);
  }

  @ApiOperation({ summary: 'Lấy danh sách dịch vụ của store (public, yêu cầu x-store-id)' })
  @Public()
  @Get()
  findAll(@StoreId() storeId: string, @Query() query: ServiceQueryDto) {
    return this.servicesService.findAll({ storeId, ...query });
  }

  @ApiOperation({ summary: 'Lấy chi tiết dịch vụ (public)' })
  @ApiParam({ name: 'id', description: 'Service ID' })
  @Public()
  @Get(':id')
  findOne(
    @Headers('x-store-id') storeId: string | undefined,
    @Param('id') id: string,
    @Query('userLat') userLat?: string,
    @Query('userLng') userLng?: string,
  ) {
    const lat = userLat != null ? +userLat : undefined;
    const lng = userLng != null ? +userLng : undefined;
    return this.servicesService.findOne(id, storeId, lat, lng);
  }

  @ApiOperation({ summary: 'Cập nhật dịch vụ' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Service ID' })
  @Patch(':id')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  update(
    @StoreId() storeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(id, storeId, dto);
  }

  @ApiOperation({ summary: 'Thêm variant cho dịch vụ' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Service ID' })
  @Post(':id/variants')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  addVariant(
    @StoreId() storeId: string,
    @Param('id') serviceId: string,
    @Body() dto: CreateServiceVariantDto,
  ) {
    return this.servicesService.addVariant(serviceId, storeId, dto);
  }

  @ApiOperation({ summary: 'Cập nhật variant của dịch vụ' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Service ID' })
  @ApiParam({ name: 'variantId', description: 'Variant ID' })
  @Patch(':id/variants/:variantId')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  updateVariant(
    @StoreId() storeId: string,
    @Param('id') serviceId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateServiceVariantDto,
  ) {
    return this.servicesService.updateVariant(serviceId, variantId, storeId, dto);
  }

  @ApiOperation({ summary: 'Xóa variant của dịch vụ' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Service ID' })
  @ApiParam({ name: 'variantId', description: 'Variant ID' })
  @Delete(':id/variants/:variantId')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  removeVariant(
    @StoreId() storeId: string,
    @Param('id') serviceId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.servicesService.removeVariant(serviceId, variantId, storeId);
  }

  @ApiOperation({ summary: 'Gán nhân viên cho dịch vụ' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Service ID' })
  @Patch(':id/staff')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  assignStaff(
    @StoreId() storeId: string,
    @Param('id') id: string,
    @Body() dto: AssignStaffDto,
  ) {
    return this.servicesService.assignStaff(id, storeId, dto.staffIds);
  }

  @ApiOperation({ summary: 'Upload ảnh cho dịch vụ (tối đa 5 ảnh, field: files)' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Service ID' })
  @ApiConsumes('multipart/form-data')
  @Post(':id/images')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  @UseInterceptors(FilesInterceptor('files', 5, { storage: memoryStorage() }))
  uploadImages(
    @StoreId() storeId: string,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Không có ảnh nào được tải lên');
    return this.servicesService.uploadImages(id, storeId, files);
  }

  @ApiOperation({ summary: 'Xóa một ảnh của dịch vụ' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Service ID' })
  @Delete(':id/images')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  removeImage(
    @StoreId() storeId: string,
    @Param('id') id: string,
    @Body() dto: RemoveServiceImageDto,
  ) {
    return this.servicesService.removeImage(id, storeId, dto.url);
  }

  @ApiOperation({ summary: 'Xóa dịch vụ' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Service ID' })
  @Delete(':id')
  @RequirePermissions(Permissions.SERVICE.DELETE)
  remove(@StoreId() storeId: string, @Param('id') id: string) {
    return this.servicesService.remove(id, storeId);
  }
}
