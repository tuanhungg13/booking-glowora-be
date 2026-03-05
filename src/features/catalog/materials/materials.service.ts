import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MaterialUnit } from '@prisma/client';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMaterialDto) {
    return this.prisma.material.create({
      data: {
        name: dto.name,
        description: dto.description,
        unit: dto.unit,
        costPrice: dto.costPrice,
        stockQuantity: dto.stockQuantity,
      },
    });
  }

  async findAll(params?: { unit?: MaterialUnit }) {
    return this.prisma.material.findMany({
      where: params?.unit ? { unit: params.unit } : undefined,
      orderBy: { name: 'asc' },
      include: { _count: { select: { serviceMaterials: true } } },
    });
  }

  async findOne(id: string) {
    const mat = await this.prisma.material.findUnique({
      where: { id },
      include: { serviceMaterials: { include: { service: true } } },
    });
    if (!mat) throw new NotFoundException('Material not found');
    return mat;
  }

  async update(id: string, dto: UpdateMaterialDto) {
    await this.findOne(id);
    return this.prisma.material.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        unit: dto.unit,
        costPrice: dto.costPrice,
        stockQuantity: dto.stockQuantity,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.material.delete({ where: { id } });
    return { deleted: true };
  }
}
