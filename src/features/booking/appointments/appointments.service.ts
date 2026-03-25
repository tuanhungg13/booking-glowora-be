import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AppointmentItemStatus,
  AppointmentItemType,
  AppointmentStatus,
  Prisma,
  StaffBookingStatus,
} from '@prisma/client';
import { CreateAppointmentDto, CreateAppointmentItemDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

const itemInclude = {
  service: true,
  combo: true,
  staff: { select: { id: true, fullName: true, email: true } },
  parentItem: { select: { id: true, type: true, nameSnapshot: true } },
  childItems: {
    include: {
      service: true,
      staff: { select: { id: true, fullName: true, email: true } },
    },
  },
} as const;

type ComboExpansionMeta = {
  sortOrder: number;
  comboId: string;
  staffId?: string | null;
};

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAppointmentDto) {
    if (!dto.items || !dto.items.length) {
      throw new BadRequestException('Appointment must have at least one item');
    }

    return this.prisma.$transaction(async (tx) => {
      const {
        subtotal,
        totalDurationMinutes,
        itemsData,
        comboMetas,
      } = await this.buildAppointmentItemsAndPricing(tx, dto.items!, dto.shopId);

      const discount = dto.discount ?? 0;
      const total = subtotal - discount;

      const startTime = new Date(dto.startTime);
      const endTime = new Date(startTime.getTime() + totalDurationMinutes * 60 * 1000);

      const appointment = await tx.appointment.create({
        data: {
          shopId: dto.shopId,
          customerId: dto.customerId,
          startTime,
          endTime,
          status: dto.status ?? AppointmentStatus.PENDING,
          durationMinutes: totalDurationMinutes,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          currency: 'VND',
          subtotal,
          discount,
          total,
          note: dto.note,
          items: {
            create: itemsData,
          },
        },
        include: {
          items: { include: itemInclude },
          customer: { select: { id: true, fullName: true, email: true } },
          shop: true,
        },
      });

      for (const meta of comboMetas) {
        const parent = await tx.appointmentItem.findFirst({
          where: {
            appointmentId: appointment.id,
            type: AppointmentItemType.COMBO,
            comboId: meta.comboId,
            sortOrder: meta.sortOrder,
          },
        });
        if (!parent) continue;

        const comboServices = await tx.comboService.findMany({
          where: { comboId: meta.comboId },
          include: { service: true },
          orderBy: [{ order: 'asc' }, { serviceId: 'asc' }],
        });

        let nextSort =
          (await tx.appointmentItem.aggregate({
            where: { appointmentId: appointment.id },
            _max: { sortOrder: true },
          }))._max.sortOrder ?? 0;

        for (const cs of comboServices) {
          const svc = cs.service;
          const lineQty = cs.quantity ?? 1;
          for (let q = 0; q < lineQty; q++) {
            nextSort += 1;
            await tx.appointmentItem.create({
              data: {
                appointmentId: appointment.id,
                parentItemId: parent.id,
                type: AppointmentItemType.COMBO_CHILD,
                status: AppointmentItemStatus.PENDING,
                staffId: meta.staffId ?? undefined,
                serviceId: svc.id,
                nameSnapshot: svc.name,
                durationSnapshot: svc.duration,
                bufferBeforeSnapshot: svc.bufferBeforeMinutes,
                bufferAfterSnapshot: svc.bufferAfterMinutes,
                unitPriceSnapshot: svc.price,
                quantity: 1,
                sortOrder: nextSort,
              },
            });
          }
        }
      }

      const allItems = await tx.appointmentItem.findMany({
        where: { appointmentId: appointment.id },
        orderBy: { sortOrder: 'asc' },
      });

      const bookingsData: Prisma.StaffBookingCreateManyInput[] = [];
      let cursorTime = startTime.getTime();
      for (const item of allItems) {
        if (item.type === AppointmentItemType.COMBO) {
          continue;
        }
        const itemDurationMs = item.durationSnapshot * 60 * 1000;
        const itemStart = new Date(cursorTime);
        const itemEnd = new Date(cursorTime + itemDurationMs);
        cursorTime += itemDurationMs;

        if (item.staffId) {
          bookingsData.push({
            shopId: dto.shopId,
            staffId: item.staffId,
            appointmentId: appointment.id,
            appointmentItemId: item.id,
            startTime: itemStart,
            endTime: itemEnd,
            status: StaffBookingStatus.ACTIVE,
          });
        }
      }

      if (bookingsData.length) {
        await tx.staffBooking.createMany({ data: bookingsData });
      }

      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: {
          items: { include: itemInclude },
          customer: { select: { id: true, fullName: true, email: true } },
          shop: true,
        },
      });
    });
  }

  async findAll(params?: {
    shopId?: string;
    status?: AppointmentStatus;
    customerId?: string;
    from?: Date;
    to?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (params?.shopId) where.shopId = params.shopId;
    if (params?.status) where.status = params.status;
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
          items: { include: itemInclude },
          customer: { select: { id: true, fullName: true, email: true } },
          shop: true,
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
        items: { include: itemInclude },
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        shop: true,
        payment: { include: { transactions: true } },
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
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        status: dto.status,
        discount: dto.discount,
        note: dto.note,
      },
      include: {
        items: { include: itemInclude },
        customer: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { deleted: true };
  }

  private async buildAppointmentItemsAndPricing(
    tx: Prisma.TransactionClient,
    items: CreateAppointmentItemDto[],
    shopId: string,
  ): Promise<{
    subtotal: number;
    totalDurationMinutes: number;
    itemsData: Prisma.AppointmentItemUncheckedCreateWithoutAppointmentInput[];
    comboMetas: ComboExpansionMeta[];
  }> {
    let subtotal = 0;
    let totalDurationMinutes = 0;

    const itemsData: Prisma.AppointmentItemUncheckedCreateWithoutAppointmentInput[] = [];
    const comboMetas: ComboExpansionMeta[] = [];

    for (const [index, item] of items.entries()) {
      const quantity = item.quantity ?? 1;
      const sortOrder = item.sortOrder ?? index;

      if (item.type === AppointmentItemType.SERVICE) {
        if (!item.serviceId) {
          throw new BadRequestException('serviceId is required for SERVICE item');
        }
        const service = await tx.service.findFirst({
          where: { id: item.serviceId, shopId },
        });
        if (!service) {
          throw new NotFoundException('Service not found for this shop');
        }

        const unitPrice = service.price;
        const duration = service.duration;

        subtotal += Number(unitPrice) * quantity;
        totalDurationMinutes += duration * quantity;

        itemsData.push({
          type: AppointmentItemType.SERVICE,
          status: AppointmentItemStatus.PENDING,
          staffId: item.staffId,
          serviceId: service.id,
          comboId: null,
          nameSnapshot: service.name,
          durationSnapshot: duration,
          bufferBeforeSnapshot: service.bufferBeforeMinutes,
          bufferAfterSnapshot: service.bufferAfterMinutes,
          unitPriceSnapshot: unitPrice,
          quantity,
          sortOrder,
        });
      } else if (item.type === AppointmentItemType.COMBO) {
        if (!item.comboId) {
          throw new BadRequestException('comboId is required for COMBO item');
        }
        const combo = await tx.combo.findFirst({
          where: { id: item.comboId, shopId },
          include: {
            services: { include: { service: true } },
          },
        });
        if (!combo) {
          throw new NotFoundException('Combo not found for this shop');
        }

        const comboDurationMinutes = combo.services.reduce(
          (sum, cs) => sum + cs.service.duration * (cs.quantity ?? 1),
          0,
        );
        const effectiveDuration =
          comboDurationMinutes > 0
            ? comboDurationMinutes
            : combo.estimatedDurationMinutes ?? 0;

        const unitPrice = combo.price;

        subtotal += Number(unitPrice) * quantity;
        totalDurationMinutes += effectiveDuration * quantity;

        itemsData.push({
          type: AppointmentItemType.COMBO,
          status: AppointmentItemStatus.PENDING,
          staffId: null,
          serviceId: null,
          comboId: combo.id,
          nameSnapshot: combo.name,
          durationSnapshot: effectiveDuration,
          bufferBeforeSnapshot: 0,
          bufferAfterSnapshot: 0,
          unitPriceSnapshot: unitPrice,
          quantity,
          sortOrder,
        });
        comboMetas.push({
          sortOrder,
          comboId: combo.id,
          staffId: item.staffId,
        });
      } else if (item.type === AppointmentItemType.CUSTOM) {
        if (!item.name) {
          throw new BadRequestException('name is required for CUSTOM item');
        }

        const duration = 0;
        const unitPrice = 0;

        subtotal += Number(unitPrice) * quantity;
        totalDurationMinutes += duration * quantity;

        itemsData.push({
          type: AppointmentItemType.CUSTOM,
          status: AppointmentItemStatus.PENDING,
          staffId: item.staffId,
          serviceId: null,
          comboId: null,
          nameSnapshot: item.name,
          durationSnapshot: duration,
          bufferBeforeSnapshot: 0,
          bufferAfterSnapshot: 0,
          unitPriceSnapshot: unitPrice,
          quantity,
          sortOrder,
        });
      }
    }

    return { subtotal, totalDurationMinutes, itemsData, comboMetas };
  }
}
