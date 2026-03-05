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
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { MaterialUnit } from '@prisma/client';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @RequirePermissions(Permissions.MATERIAL.CREATE)
  create(@Body() dto: CreateMaterialDto) {
    return this.materialsService.create(dto);
  }

  @Get()
  @RequirePermissions(Permissions.MATERIAL.VIEW)
  findAll(@Query('unit') unit?: MaterialUnit) {
    return this.materialsService.findAll({ unit });
  }

  @Get(':id')
  @RequirePermissions(Permissions.MATERIAL.VIEW)
  findOne(@Param('id') id: string) {
    return this.materialsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.MATERIAL.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.materialsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.MATERIAL.DELETE)
  remove(@Param('id') id: string) {
    return this.materialsService.remove(id);
  }
}
