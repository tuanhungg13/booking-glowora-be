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
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Permissions } from '../../../common/constants/permissions';
import { ShopId } from '../../../common/decorators/shop-id.decorator';
import { ComboStatus } from '@prisma/client';

@Controller('combos')
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

  @Post()
  @RequirePermissions(Permissions.COMBO.CREATE)
  create(@ShopId() storeId: string, @Body() dto: CreateComboDto) {
    return this.combosService.create(storeId, dto);
  }

  @Public()
  @Get()
  findAll(
    @ShopId() storeId: string,
    @Query('status') status?: ComboStatus,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.combosService.findAll({ storeId, status, categoryId });
  }

  @Public()
  @Get(':id')
  findOne(@ShopId() storeId: string, @Param('id') id: string) {
    return this.combosService.findOne(id, storeId);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.COMBO.UPDATE)
  update(
    @ShopId() storeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateComboDto,
  ) {
    return this.combosService.update(id, storeId, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.COMBO.DELETE)
  remove(@ShopId() storeId: string, @Param('id') id: string) {
    return this.combosService.remove(id, storeId);
  }
}
