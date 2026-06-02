import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { vnTodayStr } from '../../../common/utils/date.util';
import { CreateStaffDayOffDto } from './dto/create-staff-day-off.dto';
import { UpdateStaffDayOffDto } from './dto/update-staff-day-off.dto';

const dayOffInclude = {
  staff: { include: { user: { select: { id: true, fullName: true, email: true } } } },
} as const;

@Injectable()
export class StaffDayOffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string, staffId: string, dto: CreateStaffDayOffDto) {
    await this.assertStaffInStore(storeId, staffId);
    if (dto.date < vnTodayStr()) {
      throw new BadRequestException('Day off date must be today or in the future');
    }
    const date = new Date(dto.date);

    const existing = await this.prisma.staffDayOff.findFirst({
      where: { storeId, staffId, date },
    });
    if (existing) {
      throw new BadRequestException('Day off already registered for this date');
    }

    return this.prisma.staffDayOff.create({
      data: { storeId, staffId, date, reason: dto.reason },
      include: dayOffInclude,
    });
  }

  async findAll(storeId: string, staffId: string, params?: { from?: Date; to?: Date }) {
    return this.prisma.staffDayOff.findMany({
      where: {
        storeId,
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

  async findOne(id: string, storeId?: string, staffId?: string) {
    const dayOff = await this.prisma.staffDayOff.findFirst({
      where: {
        id,
        ...(storeId && { storeId }),
        ...(staffId && { staffId }),
      },
      include: { staff: { include: { user: { select: { id: true, fullName: true, email: true, phone: true } } } } },
    });
    if (!dayOff) throw new NotFoundException('Staff day off not found');
    return dayOff;
  }

  async update(id: string, storeId: string, staffId: string, dto: UpdateStaffDayOffDto) {
    await this.findOne(id, storeId, staffId);
    if (dto.date) {
      if (dto.date < vnTodayStr()) {
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

  async remove(id: string, storeId: string, staffId: string) {
    await this.findOne(id, storeId, staffId);
    await this.prisma.staffDayOff.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertStaffInStore(storeId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, storeId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found in this store');
  }
}
