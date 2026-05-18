import { Injectable, NotFoundException } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

type ServiceParams = { storeId?: string; status?: ServiceStatus; categoryId?: string };

const serviceInclude = {
  category: true,
  staffs: { include: { staff: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } } } },
} as const;

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string, dto: CreateServiceDto) {
    return this.prisma.service.create({
      data: {
        shopId: storeId,
        name: dto.name,
        description: dto.description,
        duration: dto.duration,
        price: dto.price,
        costPrice: dto.costPrice,
        status: dto.status ?? ServiceStatus.ACTIVE,
        categoryId: dto.categoryId,
      },
      include: serviceInclude,
    });
  }

  async findAll(params?: ServiceParams) {
    return this.prisma.service.findMany({
      where: {
        ...(params?.storeId && { shopId: params.storeId }),
        ...(params?.status && { status: params.status }),
        ...(params?.categoryId && { categoryId: params.categoryId }),
      },
      orderBy: { name: 'asc' },
      include: { category: true, _count: { select: { staffs: true, appointments: true } } },
    });
  }

  async findOne(id: string, storeId?: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, ...(storeId && { shopId: storeId }) },
      include: serviceInclude,
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async update(id: string, storeId: string, dto: UpdateServiceDto) {
    await this.findOne(id, storeId);

    await this.prisma.service.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        duration: dto.duration,
        price: dto.price,
        costPrice: dto.costPrice,
        status: dto.status,
        categoryId: dto.categoryId,
      },
    });

    return this.findOne(id, storeId);
  }

  async assignStaff(id: string, storeId: string, staffIds: string[]) {
    const service = await this.findOne(id, storeId);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffService.deleteMany({ where: { serviceId: id } });
      if (staffIds.length) {
        await tx.staffService.createMany({
          data: staffIds.map((staffId) => ({ serviceId: id, staffId })),
          skipDuplicates: true,
        });
      }
    });
    return this.prisma.service.findUnique({
      where: { id: service.id },
      include: serviceInclude,
    });
  }

  async remove(id: string, storeId: string) {
    await this.findOne(id, storeId);
    await this.prisma.service.update({
      where: { id },
      data: { status: ServiceStatus.INACTIVE },
    });
    return { deleted: true };
  }
}
