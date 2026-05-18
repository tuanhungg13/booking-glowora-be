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
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ServiceStatus } from '@prisma/client';

@Controller('stores/:storeId/services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @RequirePermissions(Permissions.SERVICE.CREATE)
  create(@Param('storeId') storeId: string, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(storeId, dto);
  }

  @Public()
  @Get()
  findAll(
    @Param('storeId') storeId: string,
    @Query('status') status?: ServiceStatus,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.servicesService.findAll({ storeId, status, categoryId });
  }

  @Public()
  @Get(':id')
  findOne(@Param('storeId') storeId: string, @Param('id') id: string) {
    return this.servicesService.findOne(id, storeId);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  update(
    @Param('storeId') storeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(id, storeId, dto);
  }

  @Patch(':id/staff')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  assignStaff(
    @Param('storeId') storeId: string,
    @Param('id') id: string,
    @Body() dto: AssignStaffDto,
  ) {
    return this.servicesService.assignStaff(id, storeId, dto.staffIds);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.SERVICE.DELETE)
  remove(@Param('storeId') storeId: string, @Param('id') id: string) {
    return this.servicesService.remove(id, storeId);
  }
}
