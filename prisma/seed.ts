import 'dotenv/config';
import * as bcrypt from 'bcrypt';

import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

const adapter = new PrismaMariaDb({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'gloworadev',
  database: 'glowora_business',
})

const prisma = new PrismaClient({
  adapter,
})

export default prisma

// ─── Permission codes ─────────────────────────────────────────────────────────
const PERMISSIONS = [
  // Identity
  { code: 'CREATE_USER', name: 'Tạo người dùng' },
  { code: 'VIEW_USER', name: 'Xem người dùng' },
  { code: 'UPDATE_USER', name: 'Cập nhật người dùng' },
  { code: 'DELETE_USER', name: 'Xóa người dùng' },
  { code: 'CREATE_ROLE', name: 'Tạo vai trò' },
  { code: 'VIEW_ROLE', name: 'Xem vai trò' },
  { code: 'UPDATE_ROLE', name: 'Cập nhật vai trò' },
  { code: 'DELETE_ROLE', name: 'Xóa vai trò' },
  { code: 'CREATE_PERMISSION', name: 'Tạo quyền' },
  { code: 'VIEW_PERMISSION', name: 'Xem quyền' },
  { code: 'UPDATE_PERMISSION', name: 'Cập nhật quyền' },
  { code: 'DELETE_PERMISSION', name: 'Xóa quyền' },
  // Catalog
  { code: 'CREATE_SERVICE', name: 'Tạo dịch vụ' },
  { code: 'VIEW_SERVICE', name: 'Xem dịch vụ' },
  { code: 'UPDATE_SERVICE', name: 'Cập nhật dịch vụ' },
  { code: 'DELETE_SERVICE', name: 'Xóa dịch vụ' },
  { code: 'CREATE_CATEGORY', name: 'Tạo danh mục' },
  { code: 'VIEW_CATEGORY', name: 'Xem danh mục' },
  { code: 'UPDATE_CATEGORY', name: 'Cập nhật danh mục' },
  { code: 'DELETE_CATEGORY', name: 'Xóa danh mục' },
  { code: 'CREATE_COMBO', name: 'Tạo combo' },
  { code: 'VIEW_COMBO', name: 'Xem combo' },
  { code: 'UPDATE_COMBO', name: 'Cập nhật combo' },
  { code: 'DELETE_COMBO', name: 'Xóa combo' },
  // Booking
  { code: 'CREATE_APPOINTMENT', name: 'Tạo lịch hẹn' },
  { code: 'VIEW_APPOINTMENT', name: 'Xem lịch hẹn' },
  { code: 'UPDATE_APPOINTMENT', name: 'Cập nhật lịch hẹn' },
  { code: 'DELETE_APPOINTMENT', name: 'Xóa lịch hẹn' },
  { code: 'CREATE_PAYMENT', name: 'Tạo thanh toán' },
  { code: 'VIEW_PAYMENT', name: 'Xem thanh toán' },
  { code: 'UPDATE_PAYMENT', name: 'Cập nhật thanh toán' },
  { code: 'DELETE_PAYMENT', name: 'Xóa thanh toán' },
  { code: 'CREATE_REVIEW', name: 'Tạo đánh giá' },
  { code: 'VIEW_REVIEW', name: 'Xem đánh giá' },
  { code: 'UPDATE_REVIEW', name: 'Cập nhật đánh giá' },
  { code: 'DELETE_REVIEW', name: 'Xóa đánh giá' },
  { code: 'MANAGE_REVIEW', name: 'Quản lý đánh giá (ẩn/hiện)' },
  // Messaging
  { code: 'CREATE_CONVERSATION', name: 'Tạo hội thoại' },
  { code: 'VIEW_CONVERSATION', name: 'Xem hội thoại' },
  { code: 'UPDATE_CONVERSATION', name: 'Cập nhật hội thoại' },
  { code: 'DELETE_CONVERSATION', name: 'Xóa hội thoại' },
  { code: 'CREATE_MESSAGE', name: 'Tạo tin nhắn' },
  { code: 'VIEW_MESSAGE', name: 'Xem tin nhắn' },
  { code: 'UPDATE_MESSAGE', name: 'Cập nhật tin nhắn' },
  { code: 'DELETE_MESSAGE', name: 'Xóa tin nhắn' },
  // Staff
  { code: 'CREATE_STAFF_SCHEDULE', name: 'Tạo lịch làm việc' },
  { code: 'VIEW_STAFF_SCHEDULE', name: 'Xem lịch làm việc' },
  { code: 'UPDATE_STAFF_SCHEDULE', name: 'Cập nhật lịch làm việc' },
  { code: 'DELETE_STAFF_SCHEDULE', name: 'Xóa lịch làm việc' },
  { code: 'CREATE_STAFF_DAY_OFF', name: 'Tạo ngày nghỉ' },
  { code: 'VIEW_STAFF_DAY_OFF', name: 'Xem ngày nghỉ' },
  { code: 'UPDATE_STAFF_DAY_OFF', name: 'Cập nhật ngày nghỉ' },
  { code: 'DELETE_STAFF_DAY_OFF', name: 'Xóa ngày nghỉ' },
  { code: 'CREATE_WORKING_HOUR', name: 'Tạo giờ làm việc' },
  { code: 'VIEW_WORKING_HOUR', name: 'Xem giờ làm việc' },
  { code: 'UPDATE_WORKING_HOUR', name: 'Cập nhật giờ làm việc' },
  { code: 'DELETE_WORKING_HOUR', name: 'Xóa giờ làm việc' },
  // Staff management
  { code: 'INVITE_STAFF', name: 'Mời nhân viên' },
  { code: 'VIEW_STAFF', name: 'Xem nhân viên' },
  { code: 'UPDATE_STAFF', name: 'Cập nhật nhân viên' },
  { code: 'REMOVE_STAFF', name: 'Xóa nhân viên' },
  // Notifications
  { code: 'CREATE_NOTIFICATION', name: 'Tạo thông báo' },
  { code: 'VIEW_NOTIFICATION', name: 'Xem thông báo' },
  { code: 'UPDATE_NOTIFICATION', name: 'Cập nhật thông báo' },
  { code: 'DELETE_NOTIFICATION', name: 'Xóa thông báo' },
  // Store
  { code: 'CREATE_STORE', name: 'Tạo cơ sở' },
  { code: 'VIEW_STORE', name: 'Xem cơ sở' },
  { code: 'UPDATE_STORE', name: 'Cập nhật cơ sở' },
  { code: 'DELETE_STORE', name: 'Xóa cơ sở' },
  { code: 'APPROVE_STORE', name: 'Phê duyệt cơ sở' },
];

// ─── Permissions theo từng role ───────────────────────────────────────────────
const CUSTOMER_PERMISSIONS = [
  'VIEW_SERVICE', 'VIEW_CATEGORY', 'VIEW_COMBO',
  'CREATE_APPOINTMENT', 'VIEW_APPOINTMENT',
  'CREATE_PAYMENT', 'VIEW_PAYMENT',
  'CREATE_REVIEW', 'VIEW_REVIEW',
  'CREATE_CONVERSATION', 'VIEW_CONVERSATION',
  'CREATE_MESSAGE', 'VIEW_MESSAGE',
  'VIEW_NOTIFICATION',
  'VIEW_WORKING_HOUR',
  'CREATE_STORE',
];

const STAFF_PERMISSIONS = [
  'VIEW_SERVICE', 'VIEW_CATEGORY', 'VIEW_COMBO',
  'VIEW_APPOINTMENT', 'UPDATE_APPOINTMENT',
  'VIEW_PAYMENT', 'VIEW_REVIEW',
  'CREATE_CONVERSATION', 'VIEW_CONVERSATION',
  'CREATE_MESSAGE', 'VIEW_MESSAGE',
  'VIEW_STAFF_SCHEDULE', 'VIEW_STAFF_DAY_OFF', 'CREATE_STAFF_DAY_OFF',
  'VIEW_NOTIFICATION',
  'VIEW_ROLE',
  'VIEW_STAFF',
];

const SHOP_OWNER_PERMISSIONS = [
  'VIEW_USER', 'UPDATE_USER',
  'VIEW_ROLE', 'CREATE_ROLE', 'UPDATE_ROLE',
  'VIEW_PERMISSION',
  'CREATE_SERVICE', 'VIEW_SERVICE', 'UPDATE_SERVICE', 'DELETE_SERVICE',
  'VIEW_CATEGORY',
  'CREATE_COMBO', 'VIEW_COMBO', 'UPDATE_COMBO', 'DELETE_COMBO',
  'CREATE_APPOINTMENT', 'VIEW_APPOINTMENT', 'UPDATE_APPOINTMENT', 'DELETE_APPOINTMENT',
  'CREATE_PAYMENT', 'VIEW_PAYMENT', 'UPDATE_PAYMENT',
  'VIEW_REVIEW', 'UPDATE_REVIEW', 'DELETE_REVIEW',
  'CREATE_CONVERSATION', 'VIEW_CONVERSATION', 'UPDATE_CONVERSATION',
  'CREATE_MESSAGE', 'VIEW_MESSAGE',
  'CREATE_STAFF_SCHEDULE', 'VIEW_STAFF_SCHEDULE', 'UPDATE_STAFF_SCHEDULE', 'DELETE_STAFF_SCHEDULE',
  'CREATE_STAFF_DAY_OFF', 'VIEW_STAFF_DAY_OFF', 'UPDATE_STAFF_DAY_OFF',
  'CREATE_WORKING_HOUR', 'VIEW_WORKING_HOUR', 'UPDATE_WORKING_HOUR', 'DELETE_WORKING_HOUR',
  'VIEW_NOTIFICATION', 'CREATE_NOTIFICATION',
  'CREATE_STORE', 'UPDATE_STORE',
  'INVITE_STAFF', 'VIEW_STAFF', 'UPDATE_STAFF', 'REMOVE_STAFF',
];

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Upsert Permissions
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name },
      create: { code: perm.code, name: perm.name },
    });
  }
  console.log(`✅ ${PERMISSIONS.length} permissions seeded`);

  // 2. Upsert system Roles
  const roles: Record<string, string> = {};

  const systemRoles = [
    { code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Quản trị viên hệ thống, toàn quyền', isSystem: true },
    { code: 'SHOP_OWNER', name: 'Shop Owner', description: 'Chủ cơ sở, quản lý toàn bộ hoạt động', isSystem: true },
    { code: 'STAFF', name: 'Staff', description: 'Nhân viên cơ sở', isSystem: true },
    { code: 'CUSTOMER', name: 'Customer', description: 'Khách hàng đặt lịch', isSystem: true },
  ];

  for (const r of systemRoles) {
    const existingRole = await prisma.role.findFirst({
      where: { code: r.code, shopId: null },
    });
    const role = existingRole
      ? await prisma.role.update({
        where: { id: existingRole.id },
        data: { name: r.name, description: r.description, isSystem: true },
      })
      : await prisma.role.create({
        data: {
          code: r.code,
          name: r.name,
          description: r.description,
          isSystem: true,
          shopId: null,
        },
      });
    roles[r.code] = role.id;
  }
  console.log('✅ System roles seeded');

  // Helper: gán permissions cho role
  async function assignPermissions(roleId: string, codes: string[]) {
    // Xóa hết rồi tạo lại (idempotent)
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    const perms = await prisma.permission.findMany({ where: { code: { in: codes } } });
    if (perms.length) {
      await prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  }

  // 3. SUPER_ADMIN → tất cả permissions
  const allPerms = await prisma.permission.findMany({ select: { id: true } });
  await prisma.rolePermission.deleteMany({ where: { roleId: roles['SUPER_ADMIN'] } });
  await prisma.rolePermission.createMany({
    data: allPerms.map((p) => ({ roleId: roles['SUPER_ADMIN'], permissionId: p.id })),
    skipDuplicates: true,
  });

  // 4. Gán permissions từng role
  await assignPermissions(roles['CUSTOMER'], CUSTOMER_PERMISSIONS);
  await assignPermissions(roles['STAFF'], STAFF_PERMISSIONS);
  await assignPermissions(roles['SHOP_OWNER'], SHOP_OWNER_PERMISSIONS);
  console.log('✅ Role permissions seeded');

  // 5. Super Admin user
  const adminEmail = 'admin@glowora.com';
  const adminPassword = await bcrypt.hash('Admin@123456', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: adminPassword,
      fullName: 'Super Admin',
      status: 'ACTIVE',
    },
  });

  // Gán SUPER_ADMIN role nếu chưa có
  const existingAdminRole = await prisma.userRole.findFirst({
    where: { userId: adminUser.id, roleId: roles['SUPER_ADMIN'], shopId: null },
  });
  if (!existingAdminRole) {
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: roles['SUPER_ADMIN'], shopId: null },
    });
  }
  console.log(`✅ Super Admin seeded (${adminEmail})`);

  console.log('🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
