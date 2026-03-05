import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ComboStatus } from '@prisma/client';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';

@Injectable()
export class CombosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateComboDto) {
    return this.prisma.combo.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        duration: dto.duration,
        status: dto.status ?? ComboStatus.ACTIVE,
        categoryId: dto.categoryId,
        services: dto.serviceIds?.length
          ? {
              create: dto.serviceIds.map((s, i) => ({
                serviceId: s.serviceId,
                quantity: s.quantity ?? 1,
                order: s.order ?? i,
              })),
            }
          : undefined,
      },
      include: { category: true, services: { include: { service: true } } },
    });
  }

  async findAll(params?: { status?: ComboStatus; categoryId?: string }) {
    return this.prisma.combo.findMany({
      where: {
        ...(params?.status && { status: params.status }),
        ...(params?.categoryId && { categoryId: params.categoryId }),
      },
      orderBy: { name: 'asc' },
      include: { category: true, services: { include: { service: true } } },
    });
  }

  async findOne(id: string) {
    const combo = await this.prisma.combo.findUnique({
      where: { id },
      include: {
        category: true,
        services: { include: { service: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!combo) throw new NotFoundException('Combo not found');
    return combo;
  }

  async update(id: string, dto: UpdateComboDto) {
    await this.findOne(id);
    const data: Record<string, unknown> = {
      name: dto.name,
      description: dto.description,
      price: dto.price,
      duration: dto.duration,
      status: dto.status,
      categoryId: dto.categoryId,
    };
    if (dto.serviceIds !== undefined) {
      await this.prisma.comboService.deleteMany({ where: { comboId: id } });
      if (dto.serviceIds.length) {
        await this.prisma.comboService.createMany({
          data: dto.serviceIds.map((s, i) => ({
            comboId: id,
            serviceId: s.serviceId,
            quantity: s.quantity ?? 1,
            order: s.order ?? i,
          })),
        });
      }
    }
    return this.prisma.combo.update({
      where: { id },
      data,
      include: { category: true, services: { include: { service: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.combo.delete({ where: { id } });
    return { deleted: true };
  }
}
