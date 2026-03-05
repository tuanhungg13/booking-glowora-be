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
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ServiceStatus } from '@prisma/client';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @RequirePermissions(Permissions.SERVICE.CREATE)
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Get()
  @RequirePermissions(Permissions.SERVICE.VIEW)
  findAll(
    @Query('status') status?: ServiceStatus,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.servicesService.findAll({ status, categoryId });
  }

  @Get(':id')
  @RequirePermissions(Permissions.SERVICE.VIEW)
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.SERVICE.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.SERVICE.DELETE)
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }
}
