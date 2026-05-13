import { Injectable, NotFoundException } from '@nestjs/common';
import { ComboStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';

const comboInclude = {
  category: true,
  items: { include: { service: true }, orderBy: { sortOrder: 'asc' as const } },
} as const;

@Injectable()
export class CombosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateComboDto) {
    return this.prisma.combo.create({
      data: {
        shopId: dto.shopId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        estimatedDurationMinutes: dto.estimatedDurationMinutes,
        status: dto.status ?? ComboStatus.ACTIVE,
        categoryId: dto.categoryId,
        items: dto.serviceIds?.length
          ? {
              create: dto.serviceIds.map((service, index) => ({
                serviceId: service.serviceId,
                quantity: service.quantity ?? 1,
                sortOrder: service.order ?? index,
              })),
            }
          : undefined,
      },
      include: comboInclude,
    });
  }

  async findAll(params?: { shopId?: string; status?: ComboStatus; categoryId?: string }) {
    return this.prisma.combo.findMany({
      where: {
        ...(params?.shopId && { shopId: params.shopId }),
        ...(params?.status && { status: params.status }),
        ...(params?.categoryId && { categoryId: params.categoryId }),
      },
      orderBy: { name: 'asc' },
      include: comboInclude,
    });
  }

  async findOne(id: string) {
    const combo = await this.prisma.combo.findUnique({
      where: { id },
      include: comboInclude,
    });
    if (!combo) throw new NotFoundException('Combo not found');
    return combo;
  }

  async update(id: string, dto: UpdateComboDto) {
    await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      if (dto.serviceIds !== undefined) {
        await tx.comboItem.deleteMany({ where: { comboId: id } });
        if (dto.serviceIds.length) {
          await tx.comboItem.createMany({
            data: dto.serviceIds.map((service, index) => ({
              comboId: id,
              serviceId: service.serviceId,
              quantity: service.quantity ?? 1,
              sortOrder: service.order ?? index,
            })),
          });
        }
      }

      await tx.combo.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          estimatedDurationMinutes: dto.estimatedDurationMinutes,
          status: dto.status,
          categoryId: dto.categoryId,
        },
      });
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.combo.update({
      where: { id },
      data: { status: ComboStatus.INACTIVE },
    });
    return { deleted: true };
  }
}
