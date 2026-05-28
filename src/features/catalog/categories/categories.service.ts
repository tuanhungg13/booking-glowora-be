import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateShopCategoryDto } from './dto/create-shop-category.dto';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin: tạo danh mục hệ thống (cấp 1) ──────────────────────────────────

  async create(dto: CreateCategoryDto) {
    const slug = await this.generateUniqueSlug(dto.name);
    return this.prisma.serviceCategory.create({
      data: { name: dto.name, slug, description: dto.description, iconUrl: dto.iconUrl },
    });
  }

  // ── Public: danh mục hệ thống ──────────────────────────────────────────────

  async findAll() {
    return this.prisma.serviceCategory.findMany({
      where: { shopId: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { services: true, combos: true, children: true } } },
    });
  }

  async findOne(idOrSlug: string) {
    const category = await this.prisma.serviceCategory.findFirst({
      where: { shopId: null, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        children: { orderBy: { name: 'asc' } },
        _count: { select: { services: true, combos: true } },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    const slug = dto.name ? await this.generateUniqueSlug(dto.name, id) : undefined;
    return this.prisma.serviceCategory.update({
      where: { id },
      data: { name: dto.name, slug, description: dto.description, iconUrl: dto.iconUrl },
    });
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    const hasChildren = await this.prisma.serviceCategory.count({ where: { parentId: id } });
    if (hasChildren > 0) {
      throw new BadRequestException('Không thể xóa danh mục đang có danh mục con của shop');
    }
    await this.prisma.serviceCategory.delete({ where: { id: category.id } });
    return { deleted: true };
  }

  // ── Shop: danh mục của shop (cấp 2) ───────────────────────────────────────

  async createShopCategory(shopId: string, dto: CreateShopCategoryDto) {
    const parent = await this.prisma.serviceCategory.findFirst({
      where: { id: dto.parentId, shopId: null },
    });
    if (!parent) throw new NotFoundException('Danh mục hệ thống không tồn tại');

    return this.prisma.serviceCategory.create({
      data: {
        name: dto.name,
        description: dto.description,
        shopId,
        parentId: dto.parentId,
      },
      include: { parent: { select: { id: true, name: true, slug: true } } },
    });
  }

  async findShopCategories(shopId: string) {
    return this.prisma.serviceCategory.findMany({
      where: { shopId },
      orderBy: { name: 'asc' },
      include: {
        parent: { select: { id: true, name: true, slug: true, iconUrl: true } },
        _count: { select: { services: true, combos: true } },
      },
    });
  }

  async removeShopCategory(id: string, shopId: string) {
    const category = await this.prisma.serviceCategory.findFirst({ where: { id, shopId } });
    if (!category) throw new NotFoundException('Danh mục không tồn tại');

    const inUse = await this.prisma.service.count({ where: { categoryId: id } });
    if (inUse > 0) throw new BadRequestException('Danh mục đang được dùng bởi dịch vụ, không thể xóa');

    await this.prisma.serviceCategory.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

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
}
