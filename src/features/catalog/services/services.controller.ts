import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { CreateServiceVariantDto, UpdateServiceVariantDto } from './dto/service-variant.dto';
import { PublicServiceQueryDto, ServiceQueryDto } from './dto/service-filter.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ShopId } from '../../../common/decorators/shop-id.decorator';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @RequirePermissions(Permissions.SERVICE.CREATE)
  create(@ShopId() storeId: string, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(storeId, dto);
  }

  @ApiOperation({ summary: 'Public cross-shop service exploration with pagination' })
  @Public()
  @Get('explore')
  findPublic(@Query() query: PublicServiceQueryDto) {
    return this.servicesService.findPublic(query);
  }

  @ApiOperation({ summary: 'List services for a specific shop (requires x-shop-id header)' })
  @Public()
  @Get()
  findAll(@ShopId() storeId: string, @Query() query: ServiceQueryDto) {
    return this.servicesService.findAll({ storeId, ...query });
  }

  @Public()
  @Get(':id')
  findOne(@ShopId() storeId: string, @Param('id') id: string) {
    return this.servicesService.findOne(id, storeId);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  update(
    @ShopId() storeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(id, storeId, dto);
  }

  @Post(':id/variants')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  addVariant(
    @ShopId() storeId: string,
    @Param('id') serviceId: string,
    @Body() dto: CreateServiceVariantDto,
  ) {
    return this.servicesService.addVariant(serviceId, storeId, dto);
  }

  @Patch(':id/variants/:variantId')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  updateVariant(
    @ShopId() storeId: string,
    @Param('id') serviceId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateServiceVariantDto,
  ) {
    return this.servicesService.updateVariant(serviceId, variantId, storeId, dto);
  }

  @Delete(':id/variants/:variantId')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  removeVariant(
    @ShopId() storeId: string,
    @Param('id') serviceId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.servicesService.removeVariant(serviceId, variantId, storeId);
  }

  @Patch(':id/staff')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  assignStaff(
    @ShopId() storeId: string,
    @Param('id') id: string,
    @Body() dto: AssignStaffDto,
  ) {
    return this.servicesService.assignStaff(id, storeId, dto.staffIds);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.SERVICE.DELETE)
  remove(@ShopId() storeId: string, @Param('id') id: string) {
    return this.servicesService.remove(id, storeId);
  }
}
