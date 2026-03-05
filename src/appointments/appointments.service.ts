import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus } from '@prisma/client';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAppointmentDto) {
    if (!dto.serviceId && !dto.comboId) {
      throw new BadRequestException('Either serviceId or comboId is required');
    }
    if (dto.serviceId && dto.comboId) {
      throw new BadRequestException('Provide only one of serviceId or comboId');
    }
    let totalPrice: number | undefined;
    if (dto.serviceId) {
      const svc = await this.prisma.service.findUnique({
        where: { id: dto.serviceId },
      });
      if (!svc) throw new NotFoundException('Service not found');
      totalPrice = svc.price;
    } else if (dto.comboId) {
      const combo = await this.prisma.combo.findUnique({
        where: { id: dto.comboId },
      });
      if (!combo) throw new NotFoundException('Combo not found');
      totalPrice = combo.price;
    }
    return this.prisma.appointment.create({
      data: {
        serviceId: dto.serviceId,
        comboId: dto.comboId,
        staffId: dto.staffId,
        customerId: dto.customerId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        status: dto.status ?? AppointmentStatus.PENDING,
        totalPrice: dto.totalPrice ?? totalPrice,
        note: dto.note,
      },
      include: {
        service: true,
        combo: true,
        staff: { select: { id: true, fullName: true, email: true } },
        customer: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async findAll(params?: {
    status?: AppointmentStatus;
    staffId?: string;
    customerId?: string;
    from?: Date;
    to?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (params?.status) where.status = params.status;
    if (params?.staffId) where.staffId = params.staffId;
    if (params?.customerId) where.customerId = params.customerId;
    if (params?.from || params?.to) {
      where.startTime = {};
      if (params.from) (where.startTime as Record<string, Date>).gte = params.from;
      if (params.to) (where.startTime as Record<string, Date>).lte = params.to;
    }
    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { startTime: 'desc' },
        include: {
          service: true,
          combo: true,
          staff: { select: { id: true, fullName: true, email: true } },
          customer: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const apt = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        service: true,
        combo: true,
        staff: { select: { id: true, fullName: true, email: true, phone: true } },
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        payment: true,
        review: true,
      },
    });
    if (!apt) throw new NotFoundException('Appointment not found');
    return apt;
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    await this.findOne(id);
    return this.prisma.appointment.update({
      where: { id },
      data: {
        serviceId: dto.serviceId,
        comboId: dto.comboId,
        staffId: dto.staffId,
        customerId: dto.customerId,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        status: dto.status,
        totalPrice: dto.totalPrice,
        note: dto.note,
      },
      include: {
        service: true,
        combo: true,
        staff: { select: { id: true, fullName: true, email: true } },
        customer: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { deleted: true };
  }
}
