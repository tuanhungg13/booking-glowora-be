import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ServiceStatus } from '@prisma/client';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateServiceDto) {
    return this.prisma.service.create({
      data: {
        shopId: dto.shopId,
        name: dto.name,
        description: dto.description,
        duration: dto.duration,
        price: dto.price,
        costPrice: dto.costPrice,
        status: dto.status ?? ServiceStatus.ACTIVE,
        categoryId: dto.categoryId,
        materials: dto.materialIds?.length
          ? {
              create: dto.materialIds.map((m) => ({
                materialId: m.materialId,
                quantity: m.quantity ?? 1,
              })),
            }
          : undefined,
      },
      include: { category: true, materials: { include: { material: true } } },
    });
  }

  async findAll(params?: { status?: ServiceStatus; categoryId?: string }) {
    return this.prisma.service.findMany({
      where: {
        ...(params?.status && { status: params.status }),
        ...(params?.categoryId && { categoryId: params.categoryId }),
      },
      orderBy: { name: 'asc' },
      include: { category: true, _count: { select: { staffServices: true } } },
    });
  }

  async findOne(id: string) {
    const svc = await this.prisma.service.findUnique({
      where: { id },
      include: {
        category: true,
        materials: { include: { material: true } },
        staffServices: { include: { staff: { select: { id: true, fullName: true, email: true } } } },
      },
    });
    if (!svc) throw new NotFoundException('Service not found');
    return svc;
  }

  async update(id: string, dto: UpdateServiceDto) {
    await this.findOne(id);
    const data: Record<string, unknown> = {
      name: dto.name,
      description: dto.description,
      duration: dto.duration,
      price: dto.price,
      costPrice: dto.costPrice,
      status: dto.status,
      categoryId: dto.categoryId,
    };
    if (dto.materialIds !== undefined) {
      await this.prisma.serviceMaterial.deleteMany({ where: { serviceId: id } });
      if (dto.materialIds.length) {
        await this.prisma.serviceMaterial.createMany({
          data: dto.materialIds.map((m) => ({
            serviceId: id,
            materialId: m.materialId,
            quantity: m.quantity ?? 1,
          })),
        });
      }
    }
    return this.prisma.service.update({
      where: { id },
      data,
      include: { category: true, materials: { include: { material: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.service.delete({ where: { id } });
    return { deleted: true };
  }
}
