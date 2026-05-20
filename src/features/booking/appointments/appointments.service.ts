import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, ServiceStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications/notifications.service';
import { AppointmentFilterDto } from './dto/appointment-filter.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateAppointmentDto, customerId: string) {
    const isShopMember = await this.prisma.userRole.findFirst({
      where: { userId: customerId, shopId: dto.storeId },
    });
    if (isShopMember) {
      throw new ForbiddenException('Không thể đặt lịch tại cơ sở bạn đang làm việc');
    }

    const appointment = await this.prisma.$transaction(
      async (tx) => {
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
          if (!staffService) throw new BadRequestException('Staff cannot perform this service');
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // Fire-and-forget notifications
    const customer = appointment.customer;
    const store = appointment.store;
    const service = appointment.service;
    this.notifications
      .notifyAppointmentCreated({
        appointmentId: appointment.id,
        storeId: store.id,
        storeName: store.name,
        customerId: customer.id,
        customerName: customer.fullName,
        customerEmail: customer.email,
        serviceName: service.name,
        scheduledAt: appointment.scheduledAt,
      })
      .catch(() => undefined);

    return appointment;
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

  async findStoreAppointments(storeId: string, filter: AppointmentFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AppointmentWhereInput = {
      storeId,
      ...(filter.status && { status: filter.status }),
      ...(filter.staffId && { staffId: filter.staffId }),
      ...((filter.from || filter.to) && {
        scheduledAt: {
          ...(filter.from && { gte: new Date(filter.from) }),
          ...(filter.to && { lte: new Date(filter.to) }),
        },
      }),
      ...(filter.search && {
        customer: { fullName: { contains: filter.search } },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
        include: appointmentInclude,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findCalendar(storeId: string, month: string) {
    // month = "YYYY-MM"
    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1)); // exclusive start of next month

    return this.prisma.appointment.findMany({
      where: {
        storeId,
        scheduledAt: { gte: start, lt: end },
      },
      orderBy: { scheduledAt: 'asc' },
      include: appointmentInclude,
    });
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: appointmentInclude,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  async confirm(id: string, userId: string) {
    const appointment = await this.findOne(id);
    if (appointment.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException('Only pending appointments can be confirmed');
    }
    await this.assertShopMember(userId, appointment.storeId);

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CONFIRMED, confirmedAt: new Date() },
      include: appointmentInclude,
    });

    this.notifications
      .notifyAppointmentConfirmed({
        appointmentId: id,
        customerId: updated.customer.id,
        customerEmail: updated.customer.email,
        storeName: updated.store.name,
        serviceName: updated.service.name,
        scheduledAt: updated.scheduledAt,
      })
      .catch(() => undefined);

    return updated;
  }

  async reject(id: string, userId: string, reason: string) {
    const appointment = await this.findOne(id);
    if (appointment.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException('Only pending appointments can be rejected');
    }
    await this.assertShopMember(userId, appointment.storeId);

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.REJECTED, cancellationReason: reason },
      include: appointmentInclude,
    });

    this.notifications
      .notifyAppointmentRejected({
        appointmentId: id,
        customerId: updated.customer.id,
        customerEmail: updated.customer.email,
        storeName: updated.store.name,
        serviceName: updated.service.name,
        reason,
      })
      .catch(() => undefined);

    return updated;
  }

  async complete(id: string, userId: string) {
    const appointment = await this.findOne(id);
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed appointments can be completed');
    }
    await this.assertShopMember(userId, appointment.storeId);

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.COMPLETED, completedAt: new Date() },
      include: appointmentInclude,
    });

    this.notifications
      .notifyAppointmentCompleted({
        appointmentId: id,
        customerId: updated.customer.id,
        customerEmail: updated.customer.email,
        storeName: updated.store.name,
        serviceName: updated.service.name,
      })
      .catch(() => undefined);

    return updated;
  }

  async cancel(id: string, userId: string, reason?: string) {
    const appointment = await this.findOne(id);

    if (appointment.customerId !== userId) {
      throw new ForbiddenException('Bạn không phải chủ lịch hẹn này');
    }
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

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
      include: appointmentInclude,
    });

    this.notifications
      .notifyAppointmentCancelled({
        appointmentId: id,
        storeId: updated.store.id,
        storeName: updated.store.name,
        customerId: updated.customer.id,
        customerName: updated.customer.fullName,
        customerEmail: updated.customer.email,
        serviceName: updated.service.name,
        reason,
      })
      .catch(() => undefined);

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertShopMember(userId: string, storeId: string) {
    const userRole = await this.prisma.userRole.findFirst({
      where: { userId, shopId: storeId },
    });
    if (!userRole) throw new ForbiddenException('Bạn không phải nhân viên của cơ sở này');
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

    return appointments.find((apt) => {
      const aptEnd = new Date(apt.scheduledAt.getTime() + apt.duration * 60 * 1000);
      return scheduledAt < aptEnd && apt.scheduledAt < candidateEnd;
    });
  }
}
