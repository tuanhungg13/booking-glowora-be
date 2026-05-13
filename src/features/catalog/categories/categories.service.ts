import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    return this.prisma.serviceCategory.create({
      data: {
        name: dto.name,
        slug: slugify(dto.name),
        description: dto.description,
        iconUrl: dto.iconUrl,
      },
    });
  }

  async findAll() {
    return this.prisma.serviceCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { services: true, combos: true } } },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id },
      include: { services: true, combos: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    return this.prisma.serviceCategory.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.name ? slugify(dto.name) : undefined,
        description: dto.description,
        iconUrl: dto.iconUrl,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.serviceCategory.delete({ where: { id } });
    return { deleted: true };
  }
}
