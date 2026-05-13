import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, ServiceStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

const appointmentInclude = {
  customer: { select: { id: true, fullName: true, email: true, phone: true } },
  store: true,
  service: true,
  staff: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } },
  payments: true,
  review: true,
} as const;

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAppointmentDto, customerId: string) {
    const isShopMember = await this.prisma.userRole.findFirst({
      where: { userId: customerId, shopId: dto.storeId },
    });
    if (isShopMember) {
      throw new ForbiddenException('Không thể đặt lịch tại cơ sở bạn đang làm việc');
    }

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({ where: { id: dto.storeId } });
      if (!store || store.status !== StoreStatus.ACTIVE) {
        throw new NotFoundException('Store not found or inactive');
      }

      const service = await tx.service.findFirst({
        where: { id: dto.serviceId, shopId: dto.storeId, status: ServiceStatus.ACTIVE },
      });
      if (!service) throw new NotFoundException('Service not found for this store');

      if (dto.staffId) {
        const staffService = await tx.staffService.findFirst({
          where: { staffId: dto.staffId, serviceId: dto.serviceId },
        });
        if (!staffService) {
          throw new BadRequestException('Staff cannot perform this service');
        }
      }

      const scheduledAt = new Date(dto.scheduledAt);
      const staffId = dto.staffId ?? (await this.pickAvailableStaff(tx, dto.storeId, dto.serviceId, scheduledAt, service.duration));
      if (!staffId) throw new ConflictException('No staff is available for this slot');

      await this.assertNoOverlap(tx, staffId, scheduledAt, service.duration);

      return tx.appointment.create({
        data: {
          customerId,
          storeId: dto.storeId,
          serviceId: dto.serviceId,
          staffId,
          scheduledAt,
          duration: service.duration,
          price: service.price,
          status: store.autoConfirm ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING,
          confirmedAt: store.autoConfirm ? new Date() : undefined,
          notes: dto.notes,
        },
        include: appointmentInclude,
      });
    });
  }

  async findAll(params?: {
    storeId?: string;
    status?: AppointmentStatus;
    customerId?: string;
    from?: Date;
    to?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.AppointmentWhereInput = {
      ...(params?.storeId && { storeId: params.storeId }),
      ...(params?.status && { status: params.status }),
      ...(params?.customerId && { customerId: params.customerId }),
      ...((params?.from || params?.to) && {
        scheduledAt: {
          ...(params?.from && { gte: params.from }),
          ...(params?.to && { lte: params.to }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { scheduledAt: 'desc' },
        include: appointmentInclude,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return { items, total };
  }

  findMy(customerId: string, status?: AppointmentStatus) {
    return this.findAll({ customerId, status });
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: appointmentInclude,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    await this.findOne(id);
    return this.prisma.appointment.update({
      where: { id },
      data: {
        staffId: dto.staffId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: dto.status,
        notes: dto.notes,
        cancellationReason: dto.cancellationReason,
      },
      include: appointmentInclude,
    });
  }

  async confirm(id: string) {
    const appointment = await this.findOne(id);
    if (appointment.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException('Only pending appointments can be confirmed');
    }
    return this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CONFIRMED, confirmedAt: new Date() },
      include: appointmentInclude,
    });
  }

  async reject(id: string, reason?: string) {
    const appointment = await this.findOne(id);
    if (appointment.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException('Only pending appointments can be rejected');
    }
    return this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.REJECTED, cancellationReason: reason },
      include: appointmentInclude,
    });
  }

  async complete(id: string) {
    const appointment = await this.findOne(id);
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed appointments can be completed');
    }
    return this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.COMPLETED, completedAt: new Date() },
      include: appointmentInclude,
    });
  }

  async cancel(id: string, reason?: string) {
    const appointment = await this.findOne(id);
    if (
      appointment.status !== AppointmentStatus.PENDING &&
      appointment.status !== AppointmentStatus.CONFIRMED
    ) {
      throw new BadRequestException('Only pending or confirmed appointments can be cancelled');
    }
    const deadline = appointment.scheduledAt.getTime() - appointment.store.cancelBeforeHours * 60 * 60 * 1000;
    if (Date.now() > deadline) {
      throw new BadRequestException(`Chỉ được hủy trước ${appointment.store.cancelBeforeHours} giờ`);
    }
    return this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
      include: appointmentInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { deleted: true };
  }

  private async pickAvailableStaff(
    tx: Prisma.TransactionClient,
    storeId: string,
    serviceId: string,
    scheduledAt: Date,
    duration: number,
  ) {
    const mappings = await tx.staffService.findMany({
      where: { serviceId, staff: { storeId, status: 'ACTIVE' } },
      select: { staffId: true },
    });
    for (const mapping of mappings) {
      const overlap = await this.findOverlap(tx, mapping.staffId, scheduledAt, duration);
      if (!overlap) return mapping.staffId;
    }
    return null;
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    staffId: string,
    scheduledAt: Date,
    duration: number,
  ) {
    const overlap = await this.findOverlap(tx, staffId, scheduledAt, duration);
    if (overlap) throw new ConflictException('Slot này vừa được đặt');
  }

  private async findOverlap(
    tx: Prisma.TransactionClient,
    staffId: string,
    scheduledAt: Date,
    duration: number,
  ) {
    const dayStart = new Date(scheduledAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const candidateEnd = new Date(scheduledAt.getTime() + duration * 60 * 1000);

    const appointments = await tx.appointment.findMany({
      where: {
        staffId,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
      select: { scheduledAt: true, duration: true },
    });

    return appointments.find((appointment) => {
      const existingEnd = new Date(appointment.scheduledAt.getTime() + appointment.duration * 60 * 1000);
      return scheduledAt < existingEnd && appointment.scheduledAt < candidateEnd;
    });
  }
}
