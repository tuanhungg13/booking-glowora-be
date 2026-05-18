import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateStaffDayOffDto } from './dto/create-staff-day-off.dto';
import { UpdateStaffDayOffDto } from './dto/update-staff-day-off.dto';

const dayOffInclude = {
  staff: { include: { user: { select: { id: true, fullName: true, email: true } } } },
} as const;

@Injectable()
export class StaffDayOffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string, staffId: string, dto: CreateStaffDayOffDto) {
    const date = new Date(dto.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      throw new BadRequestException('Day off date must be today or in the future');
    }

    const existing = await this.prisma.staffDayOff.findFirst({
      where: { shopId: storeId, staffId, date },
    });
    if (existing) {
      throw new BadRequestException('Day off already registered for this date');
    }

    return this.prisma.staffDayOff.create({
      data: { shopId: storeId, staffId, date, reason: dto.reason },
      include: dayOffInclude,
    });
  }

  async findAll(storeId: string, staffId: string, params?: { from?: Date; to?: Date }) {
    return this.prisma.staffDayOff.findMany({
      where: {
        shopId: storeId,
        staffId,
        ...(params?.from || params?.to
          ? {
              date: {
                ...(params.from && { gte: params.from }),
                ...(params.to && { lte: params.to }),
              },
            }
          : {}),
      },
      orderBy: { date: 'asc' },
      include: dayOffInclude,
    });
  }

  async findOne(id: string) {
    const dayOff = await this.prisma.staffDayOff.findUnique({
      where: { id },
      include: { staff: { include: { user: { select: { id: true, fullName: true, email: true, phone: true } } } } },
    });
    if (!dayOff) throw new NotFoundException('Staff day off not found');
    return dayOff;
  }

  async update(id: string, dto: UpdateStaffDayOffDto) {
    await this.findOne(id);
    if (dto.date) {
      const date = new Date(dto.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) {
        throw new BadRequestException('Day off date must be today or in the future');
      }
    }
    return this.prisma.staffDayOff.update({
      where: { id },
      data: {
        date: dto.date ? new Date(dto.date) : undefined,
        reason: dto.reason,
      },
      include: dayOffInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.staffDayOff.delete({ where: { id } });
    return { deleted: true };
  }
}
