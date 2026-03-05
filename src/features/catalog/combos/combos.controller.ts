import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CombosService } from './combos.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { ComboStatus } from '@prisma/client';

@Controller('combos')
@UseGuards(JwtAuthGuard)
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

  @Post()
  create(@Body() dto: CreateComboDto) {
    return this.combosService.create(dto);
  }

  @Get()
  findAll(
    @Query('status') status?: ComboStatus,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.combosService.findAll({ status, categoryId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.combosService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateComboDto) {
    return this.combosService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.combosService.remove(id);
  }
}
