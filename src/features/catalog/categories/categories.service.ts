import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const slug = await this.generateUniqueSlug(dto.name);
    return this.prisma.serviceCategory.create({
      data: {
        name: dto.name,
        slug,
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

  async findOne(idOrSlug: string) {
    const category = await this.prisma.serviceCategory.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { services: true, combos: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    const slug = dto.name ? await this.generateUniqueSlug(dto.name, id) : undefined;
    return this.prisma.serviceCategory.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        iconUrl: dto.iconUrl,
      },
    });
  }

  private async generateUniqueSlug(name: string, excludeId?: string) {
    const base = slugify(name) || 'category';
    let slug = base;
    let suffix = 2;
    while (true) {
      const existing = await this.prisma.serviceCategory.findFirst({
        where: { slug, ...(excludeId && { id: { not: excludeId } }) },
      });
      if (!existing) return slug;
      slug = `${base}-${suffix++}`;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.serviceCategory.delete({ where: { id } });
    return { deleted: true };
  }
}
