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
import { CombosService } from './combos.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ComboStatus } from '@prisma/client';

@Controller('combos')
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

  @Post()
  @RequirePermissions(Permissions.COMBO.CREATE)
  create(@Body() dto: CreateComboDto) {
    return this.combosService.create(dto);
  }

  @Get()
  @RequirePermissions(Permissions.COMBO.VIEW)
  findAll(
    @Query('status') status?: ComboStatus,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.combosService.findAll({ status, categoryId });
  }

  @Get(':id')
  @RequirePermissions(Permissions.COMBO.VIEW)
  findOne(@Param('id') id: string) {
    return this.combosService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.COMBO.UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateComboDto) {
    return this.combosService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.COMBO.DELETE)
  remove(@Param('id') id: string) {
    return this.combosService.remove(id);
  }
}
