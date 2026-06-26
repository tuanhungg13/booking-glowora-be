import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CouponType, LogType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SystemLogService } from '../../../system-log/system-log.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { CouponFilterDto } from './dto/coupon-filter.dto';

const adminCouponListInclude = {
  store: {
    select: {
      name: true,
    },
  },
} as const;

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLog: SystemLogService,
  ) { }

  // ─── CRUD (store owner & admin) ──────────────────────────────────────────────

  async create(dto: CreateCouponDto, createdById: string, storeId: string | null = null) {
    if (dto.expiredAt && new Date(dto.expiredAt) <= new Date(dto.startAt)) {
      throw new BadRequestException('expiredAt phải sau startAt');
    }
    if (dto.type === CouponType.PERCENTAGE && (dto.value <= 0 || dto.value > 100)) {
      throw new BadRequestException('Coupon PERCENTAGE phải có value từ 1 đến 100');
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase(),
        type: dto.type,
        value: dto.value,
        minAmount: dto.minAmount ?? null,
        maxDiscount: dto.maxDiscount ?? null,
        usageLimit: dto.usageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? null,
        startAt: new Date(dto.startAt),
        expiredAt: dto.expiredAt ? new Date(dto.expiredAt) : null,
        storeId,
        createdById,
      },
    });

    this.systemLog.log({
      type: LogType.COUPON_CREATED,
      actorId: createdById,
      storeId: storeId ?? undefined,
      targetId: coupon.id,
      targetType: 'Coupon',
      metadata: { code: coupon.code },
    });

    return coupon;
  }

  async findAll(
    filter: CouponFilterDto,
    storeId?: string | null,
    includeStoreName = false,
  ) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CouponWhereInput = {
      ...(storeId !== undefined && storeId !== null && { storeId }),
      ...(filter.search && { code: { contains: filter.search.toUpperCase() } }),
      ...(filter.type !== undefined && { type: filter.type }),
      ...(filter.isActive !== undefined && { isActive: filter.isActive }),
      ...(filter.to && { startAt: { lte: new Date(filter.to) } }),
      ...(filter.from && { OR: [{ expiredAt: { gte: new Date(filter.from) } }, { expiredAt: null }] }),
    };

    const [items, total] = await Promise.all([
      includeStoreName
        ? this.prisma.coupon.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: adminCouponListInclude,
        })
        : this.prisma.coupon.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      this.prisma.coupon.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon không tìm thấy');
    return coupon;
  }

  async update(id: string, dto: UpdateCouponDto, actorId: string, actorStoreId?: string | null) {
    const coupon = await this.findOne(id);
    this.assertActor(coupon.storeId, actorStoreId);

    if (dto.expiredAt && new Date(dto.expiredAt) <= coupon.startAt) {
      throw new BadRequestException('expiredAt phải sau startAt');
    }

    const updated = await this.prisma.coupon.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.expiredAt && { expiredAt: new Date(dto.expiredAt) }),
      },
    });

    this.systemLog.log({
      type: LogType.COUPON_UPDATED,
      actorId,
      storeId: coupon.storeId ?? undefined,
      targetId: id,
      targetType: 'Coupon',
      metadata: { code: coupon.code, changes: dto },
    });

    return updated;
  }

  async remove(id: string, actorId: string, actorStoreId?: string | null) {
    const coupon = await this.findOne(id);
    this.assertActor(coupon.storeId, actorStoreId);

    let result: typeof coupon;
    if (coupon.usedCount > 0) {
      // Soft delete: không xóa coupon đã từng dùng để bảo toàn CouponUsage
      result = await this.prisma.coupon.update({
        where: { id },
        data: { isActive: false },
      });
    } else {
      result = await this.prisma.coupon.delete({ where: { id } });
    }

    this.systemLog.log({
      type: LogType.COUPON_DELETED,
      actorId,
      storeId: coupon.storeId ?? undefined,
      targetId: id,
      targetType: 'Coupon',
      metadata: { code: coupon.code, softDelete: coupon.usedCount > 0 },
    });

    return result;
  }

  // ─── Danh sách coupon khả dụng cho customer ──────────────────────────────

  async findAvailable(storeId: string, userId: string) {
    const now = new Date();

    // Query 1: coupon active, trong hạn, thuộc store này hoặc platform-wide
    const candidates = await this.prisma.coupon.findMany({
      where: {
        isActive: true,
        startAt: { lte: now },
        OR: [{ expiredAt: { gte: now } }, { expiredAt: null }],
        AND: [{ OR: [{ storeId }, { storeId: null }] }],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Lọc coupon đã hết tổng lượt dùng (so sánh 2 field — Prisma không hỗ trợ WHERE nên filter ở JS)
    const notExhausted = candidates.filter(
      (c) => c.usageLimit === null || c.usedCount < c.usageLimit,
    );

    if (notExhausted.length === 0) return [];

    // Query 2: đếm số lần user đã dùng từng coupon — batch, không N+1
    const couponIds = notExhausted.map((c) => c.id);
    const userUsages = await this.prisma.couponUsage.groupBy({
      by: ['couponId'],
      where: { couponId: { in: couponIds }, userId },
      _count: { id: true },
    });

    const usageMap = new Map(userUsages.map((u) => [u.couponId, u._count.id]));

    return notExhausted.map((c) => {
      const userUsedCount = usageMap.get(c.id) ?? 0;
      const canUse = c.perUserLimit === null || userUsedCount < c.perUserLimit;
      return { ...c, userUsedCount, canUse };
    });
  }

  // ─── Validate (preview cho customer trước khi đặt) ────────────────────────

  async validate(code: string, storeId: string, userId: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) throw new BadRequestException('Mã coupon không tồn tại');

    await this.assertCouponUsable(this.prisma, coupon, storeId, userId);

    return {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minAmount: coupon.minAmount,
      maxDiscount: coupon.maxDiscount,
    };
  }

  // ─── Dùng trong transaction của bookings.service ──────────────────────────

  async applyToBooking(
    tx: Prisma.TransactionClient,
    code: string,
    storeId: string,
    totalPrice: Prisma.Decimal,
    userId: string,
  ): Promise<{ couponId: string; discountAmount: Prisma.Decimal }> {
    const coupon = await tx.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) throw new BadRequestException('Mã coupon không tồn tại');

    await this.assertCouponUsable(tx, coupon, storeId, userId);

    const totalPriceNum = Number(totalPrice);
    if (coupon.minAmount !== null && totalPriceNum < Number(coupon.minAmount)) {
      throw new BadRequestException(
        `Giá trị đặt tối thiểu ${Number(coupon.minAmount).toLocaleString('vi-VN')}đ để dùng mã này`,
      );
    }

    // Tăng usedCount ngay trong transaction — rollback tự động nếu booking thất bại
    await tx.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });

    const discountAmount = new Prisma.Decimal(this.calcDiscount(coupon, totalPriceNum));
    return { couponId: coupon.id, discountAmount };
  }

  async recordUsage(
    tx: Prisma.TransactionClient,
    couponId: string,
    userId: string,
    bookingId: string,
    discount: Prisma.Decimal,
  ): Promise<void> {
    await tx.couponUsage.create({ data: { couponId, userId, bookingId, discount } });
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async assertCouponUsable(
    client: Pick<Prisma.TransactionClient, 'couponUsage'>,
    coupon: { id: string; isActive: boolean; startAt: Date; expiredAt: Date | null; storeId: string | null; usageLimit: number | null; usedCount: number; perUserLimit: number | null },
    storeId: string,
    userId: string,
  ): Promise<void> {
    if (coupon.storeId && coupon.storeId !== storeId) {
      throw new BadRequestException('Mã coupon không hợp lệ');
    }

    if (!coupon.isActive) throw new BadRequestException('Mã coupon đã bị vô hiệu hóa');

    const now = new Date();
    if (now < coupon.startAt) throw new BadRequestException('Mã coupon chưa có hiệu lực');
    if (coupon.expiredAt !== null && now > coupon.expiredAt) throw new BadRequestException('Mã coupon đã hết hạn');

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Mã coupon đã hết lượt sử dụng');
    }

    if (coupon.perUserLimit !== null) {
      const userUsed = await client.couponUsage.count({ where: { couponId: coupon.id, userId } });
      if (userUsed >= coupon.perUserLimit) {
        throw new BadRequestException('Bạn đã dùng hết lượt cho mã coupon này');
      }
    }
  }

  private calcDiscount(
    coupon: { type: CouponType; value: Prisma.Decimal; maxDiscount: Prisma.Decimal | null },
    totalPrice: number,
  ): number {
    if (coupon.type === CouponType.PERCENTAGE) {
      const raw = (totalPrice * Number(coupon.value)) / 100;
      return coupon.maxDiscount !== null ? Math.min(raw, Number(coupon.maxDiscount)) : raw;
    }
    // FIXED
    return Math.min(Number(coupon.value), totalPrice);
  }

  private assertActor(couponStoreId: string | null, actorStoreId?: string | null) {
    // null actorStoreId = admin (có thể sửa mọi coupon)
    if (actorStoreId === undefined) return;
    if (couponStoreId !== actorStoreId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa coupon này');
    }
  }
}
