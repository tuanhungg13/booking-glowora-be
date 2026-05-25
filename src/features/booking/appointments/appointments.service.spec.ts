import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService — Phase 4', () => {
  let service: AppointmentsService;
  let prisma: any;
  let notifications: any;
  let tx: any;

  const storeId = 'store-001';
  const serviceId = 'svc-001';
  const variantId = 'var-001';
  const staffId = 'staff-001';
  const customerId = 'user-001';
  const appointmentId = 'apt-001';

  const baseStore = {
    id: storeId,
    status: 'ACTIVE',
    autoConfirm: false,
    cancelBeforeHours: 2,
    name: 'Glowora Test Spa',
  };

  const baseService = {
    id: serviceId,
    shopId: storeId,
    name: 'Massage Thư Giãn',
    status: 'ACTIVE',
  };

  const baseVariant = {
    id: variantId,
    serviceId,
    name: 'Gói cơ bản',
    duration: 60,
    price: 200000,
    status: 'ACTIVE',
  };

  const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3h from now

  const baseAppointment = {
    id: appointmentId,
    customerId,
    storeId,
    serviceId,
    staffId,
    status: AppointmentStatus.PENDING,
    scheduledAt: futureDate,
    duration: 60,
    price: 200000,
    store: { ...baseStore },
    customer: { id: customerId, fullName: 'Test User', email: 'test@test.com', phone: null },
    service: { ...baseService },
    staff: null,
    payments: [],
    review: null,
  };

  beforeEach(() => {
    tx = {
      store: { findUnique: jest.fn().mockResolvedValue(baseStore) },
      serviceVariant: { findFirst: jest.fn().mockResolvedValue(baseVariant) },
      staffService: { findFirst: jest.fn().mockResolvedValue({ staffId, serviceId }), findMany: jest.fn().mockResolvedValue([{ staffId }]) },
      appointment: {
        create: jest.fn().mockResolvedValue(baseAppointment),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    prisma = {
      userRole: { findFirst: jest.fn().mockResolvedValue(null) },
      appointment: {
        findUnique: jest.fn().mockResolvedValue(baseAppointment),
        findMany: jest.fn().mockResolvedValue([baseAppointment]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue({ ...baseAppointment, status: AppointmentStatus.CONFIRMED, confirmedAt: new Date() }),
        delete: jest.fn().mockResolvedValue(baseAppointment),
      },
      staffService: {
        findMany: jest.fn().mockResolvedValue([{ staffId }]),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    notifications = {
      notifyAppointmentCreated: jest.fn().mockResolvedValue(undefined),
      notifyAppointmentConfirmed: jest.fn().mockResolvedValue(undefined),
      notifyAppointmentRejected: jest.fn().mockResolvedValue(undefined),
      notifyAppointmentCompleted: jest.fn().mockResolvedValue(undefined),
      notifyAppointmentCancelled: jest.fn().mockResolvedValue(undefined),
    };

    service = new AppointmentsService(prisma, notifications);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      storeId,
      serviceId,
      variantId,
      staffId,
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    it('throws ForbiddenException when customer is a shop member', async () => {
      prisma.userRole.findFirst.mockResolvedValue({ userId: customerId, shopId: storeId });

      await expect(service.create(dto, customerId)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when store is not found', async () => {
      tx.store.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, customerId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when store status is not ACTIVE', async () => {
      tx.store.findUnique.mockResolvedValue({ ...baseStore, status: 'PENDING' });

      await expect(service.create(dto, customerId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when variant not found for this store', async () => {
      tx.serviceVariant.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, customerId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when chosen staff cannot perform the service', async () => {
      tx.staffService.findFirst.mockResolvedValue(null);

      await expect(service.create(dto, customerId)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when no staff is available (no staffId provided)', async () => {
      const dtoNoStaff = { ...dto, staffId: undefined };
      tx.staffService.findMany.mockResolvedValue([]); // pickAvailableStaff uses tx inside transaction

      await expect(service.create(dtoNoStaff, customerId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when the slot overlaps with an existing appointment', async () => {
      const scheduledAt = new Date(dto.scheduledAt);
      tx.appointment.findMany.mockResolvedValue([{ scheduledAt, duration: 120 }]);

      await expect(service.create(dto, customerId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates appointment with PENDING status when autoConfirm is false', async () => {
      await service.create(dto, customerId);

      expect(tx.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AppointmentStatus.PENDING }),
        }),
      );
    });

    it('creates appointment with CONFIRMED status when store.autoConfirm is true', async () => {
      tx.store.findUnique.mockResolvedValue({ ...baseStore, autoConfirm: true });

      await service.create(dto, customerId);

      expect(tx.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AppointmentStatus.CONFIRMED,
            confirmedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('snapshots variant.duration and variant.price into the appointment', async () => {
      await service.create(dto, customerId);

      expect(tx.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            duration: baseVariant.duration,
            price: baseVariant.price,
          }),
        }),
      );
    });

    it('wraps creation in a prisma.$transaction', async () => {
      await service.create(dto, customerId);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns items and total', async () => {
      const result = await service.findAll({ storeId });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('applies pagination skip and take', async () => {
      await service.findAll({ skip: 10, take: 5 });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('filters by storeId when provided', async () => {
      await service.findAll({ storeId });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ storeId }) }),
      );
    });

    it('filters by status when provided', async () => {
      await service.findAll({ status: AppointmentStatus.CONFIRMED });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: AppointmentStatus.CONFIRMED }) }),
      );
    });
  });

  // ─── confirm ──────────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('throws BadRequestException when appointment is not PENDING', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.CONFIRMED,
      });

      await expect(service.confirm(appointmentId, 'staff-user')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException when user is not a shop member', async () => {
      // prisma.userRole.findFirst default mock already returns null
      await expect(service.confirm(appointmentId, 'outsider')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates appointment to CONFIRMED with confirmedAt timestamp', async () => {
      prisma.userRole.findFirst.mockResolvedValue({ userId: 'staff-user', shopId: storeId });

      await service.confirm(appointmentId, 'staff-user');

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: appointmentId },
          data: expect.objectContaining({
            status: AppointmentStatus.CONFIRMED,
            confirmedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ─── reject ───────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('throws BadRequestException when appointment is not PENDING', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.CONFIRMED,
      });

      await expect(service.reject(appointmentId, 'staff-user', 'Hết nhân viên')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException when user is not a shop member', async () => {
      await expect(service.reject(appointmentId, 'outsider', 'reason')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates appointment to REJECTED with cancellationReason', async () => {
      prisma.userRole.findFirst.mockResolvedValue({ userId: 'staff-user', shopId: storeId });

      await service.reject(appointmentId, 'staff-user', 'Hết chỗ');

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AppointmentStatus.REJECTED,
            cancellationReason: 'Hết chỗ',
          }),
        }),
      );
    });
  });

  // ─── complete ─────────────────────────────────────────────────────────────

  describe('complete', () => {
    it('throws BadRequestException when appointment is not CONFIRMED', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.PENDING,
      });

      await expect(service.complete(appointmentId, 'staff-user')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException when user is not a shop member', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.CONFIRMED,
      });

      await expect(service.complete(appointmentId, 'outsider')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates appointment to COMPLETED with completedAt timestamp', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.CONFIRMED,
      });
      prisma.userRole.findFirst.mockResolvedValue({ userId: 'staff-user', shopId: storeId });
      prisma.appointment.update.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.COMPLETED,
        completedAt: new Date(),
      });

      await service.complete(appointmentId, 'staff-user');

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AppointmentStatus.COMPLETED,
            completedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ─── cancel ───────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('throws ForbiddenException when user is not the appointment owner', async () => {
      await expect(service.cancel(appointmentId, 'other-user')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException when appointment is already COMPLETED', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.COMPLETED,
      });

      await expect(service.cancel(appointmentId, customerId)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when cancellation deadline has passed', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000), // only 30 mins away
        store: { ...baseStore, cancelBeforeHours: 2 },
      });

      await expect(service.cancel(appointmentId, customerId)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancels appointment with CANCELLED status and sets cancelledAt', async () => {
      prisma.appointment.update.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
      });

      await service.cancel(appointmentId, customerId, 'Bận đột xuất');

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AppointmentStatus.CANCELLED,
            cancelledAt: expect.any(Date),
            cancellationReason: 'Bận đột xuất',
          }),
        }),
      );
    });

    it('cancels without reason when reason is not provided', async () => {
      prisma.appointment.update.mockResolvedValue({
        ...baseAppointment,
        status: AppointmentStatus.CANCELLED,
      });

      await service.cancel(appointmentId, customerId);

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AppointmentStatus.CANCELLED }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns appointment when found', async () => {
      const result = await service.findOne(appointmentId);

      expect(result.id).toBe(appointmentId);
    });

    it('throws NotFoundException when appointment does not exist', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes appointment and returns { deleted: true }', async () => {
      const result = await service.remove(appointmentId);

      expect(prisma.appointment.delete).toHaveBeenCalledWith({ where: { id: appointmentId } });
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException when appointment does not exist', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
