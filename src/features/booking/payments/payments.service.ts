import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentStatus, Prisma } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

const paymentInclude = {
  appointment: {
    include: {
      customer: true,
      items: {
        include: {
          service: true,
          combo: true,
          staff: { select: { id: true, fullName: true, email: true } },
        },
      },
    },
  },
  transactions: true,
} as const;

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentDto) {
    const apt = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
    });
    if (!apt) throw new NotFoundException('Appointment not found');
    const existing = await this.prisma.payment.findUnique({
      where: { appointmentId: dto.appointmentId },
    });
    if (existing) {
      throw new ConflictException('Appointment already has a payment');
    }

    const transactions =
      dto.transactions?.map((t) => ({
        type: t.type,
        status: t.status,
        amount: t.amount,
        providerTxnId: t.providerTxnId,
        rawResponse: t.rawResponse as Prisma.InputJsonValue | undefined,
      })) ?? [];

    return this.prisma.payment.create({
      data: {
        appointmentId: dto.appointmentId,
        method: dto.method,
        amount: dto.amount,
        status: dto.status ?? PaymentStatus.PENDING,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        transactions:
          transactions.length > 0
            ? { create: transactions }
            : undefined,
      },
      include: paymentInclude,
    });
  }

  async findAll(params?: { status?: PaymentStatus; skip?: number; take?: number }) {
    const where = params?.status ? { status: params.status } : undefined;
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: params?.skip,
        take: params?.take ?? 20,
        orderBy: { id: 'desc' },
        include: paymentInclude,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string) {
    const pay = await this.prisma.payment.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!pay) throw new NotFoundException('Payment not found');
    return pay;
  }

  async update(id: string, dto: UpdatePaymentDto) {
    await this.findOne(id);
    return this.prisma.payment.update({
      where: { id },
      data: {
        method: dto.method,
        amount: dto.amount,
        status: dto.status,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
      },
      include: paymentInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.payment.delete({ where: { id } });
    return { deleted: true };
  }
}
