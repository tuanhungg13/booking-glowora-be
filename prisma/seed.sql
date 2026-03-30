-- ============================================================
-- SEED: Roles, Permissions & Role-Permission mapping
-- Idempotent - safe to run multiple times (INSERT IGNORE)
-- MySQL version
-- ============================================================

START TRANSACTION;

-- ─────────────────────────────────────────────────────────────
-- 1. ROLES
-- ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO `Role` (id, code, name, description, isSystem, shopId) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'SUPER_ADMIN',     'Super Admin',  'Quan tri vien he thong, toan quyen', TRUE, NULL),
  ('a0000000-0000-0000-0000-000000000002', 'SHOP_OWNER',      'Shop Owner',   'Chu cua hang, quan ly toan bo hoat dong', TRUE, NULL),
  ('a0000000-0000-0000-0000-000000000003', 'STAFF',           'Staff',        'Nhan vien cua hang (thuc hien dich vu)', TRUE, NULL),
  ('a0000000-0000-0000-0000-000000000004', 'CUSTOMER',        'Customer',     'Khach hang dat lich', TRUE, NULL),
  ('a0000000-0000-0000-0000-000000000005', 'WAREHOUSE_STAFF', 'Warehouse',    'Nhan vien kho, quan ly vat tu', TRUE, NULL);

-- ─────────────────────────────────────────────────────────────
-- 2. PERMISSIONS (60 permissions)
-- ─────────────────────────────────────────────────────────────

-- Identity
INSERT IGNORE INTO `Permission` (id, code, name, description) VALUES
  ('b0000000-0000-0000-0001-000000000001', 'CREATE_USER',       'Tao nguoi dung',        'Tao tai khoan nguoi dung moi'),
  ('b0000000-0000-0000-0001-000000000002', 'VIEW_USER',         'Xem nguoi dung',        'Xem danh sach va chi tiet nguoi dung'),
  ('b0000000-0000-0000-0001-000000000003', 'UPDATE_USER',       'Cap nhat nguoi dung',   'Chinh sua thong tin nguoi dung'),
  ('b0000000-0000-0000-0001-000000000004', 'DELETE_USER',       'Xoa nguoi dung',        'Xoa tai khoan nguoi dung'),

  ('b0000000-0000-0000-0002-000000000001', 'CREATE_ROLE',       'Tao vai tro',           'Tao vai tro moi'),
  ('b0000000-0000-0000-0002-000000000002', 'VIEW_ROLE',         'Xem vai tro',           'Xem danh sach va chi tiet vai tro'),
  ('b0000000-0000-0000-0002-000000000003', 'UPDATE_ROLE',       'Cap nhat vai tro',      'Chinh sua vai tro'),
  ('b0000000-0000-0000-0002-000000000004', 'DELETE_ROLE',       'Xoa vai tro',           'Xoa vai tro'),

  ('b0000000-0000-0000-0003-000000000001', 'CREATE_PERMISSION', 'Tao quyen',             'Tao quyen moi'),
  ('b0000000-0000-0000-0003-000000000002', 'VIEW_PERMISSION',   'Xem quyen',             'Xem danh sach quyen'),
  ('b0000000-0000-0000-0003-000000000003', 'UPDATE_PERMISSION', 'Cap nhat quyen',        'Chinh sua quyen'),
  ('b0000000-0000-0000-0003-000000000004', 'DELETE_PERMISSION', 'Xoa quyen',             'Xoa quyen'),

-- Catalog
  ('b0000000-0000-0000-0004-000000000001', 'CREATE_SERVICE',    'Tao dich vu',           'Tao dich vu moi'),
  ('b0000000-0000-0000-0004-000000000002', 'VIEW_SERVICE',      'Xem dich vu',           'Xem danh sach dich vu'),
  ('b0000000-0000-0000-0004-000000000003', 'UPDATE_SERVICE',    'Cap nhat dich vu',      'Chinh sua dich vu'),
  ('b0000000-0000-0000-0004-000000000004', 'DELETE_SERVICE',    'Xoa dich vu',           'Xoa dich vu'),

  ('b0000000-0000-0000-0005-000000000001', 'CREATE_CATEGORY',   'Tao danh muc',          'Tao danh muc moi'),
  ('b0000000-0000-0000-0005-000000000002', 'VIEW_CATEGORY',     'Xem danh muc',          'Xem danh sach danh muc'),
  ('b0000000-0000-0000-0005-000000000003', 'UPDATE_CATEGORY',   'Cap nhat danh muc',     'Chinh sua danh muc'),
  ('b0000000-0000-0000-0005-000000000004', 'DELETE_CATEGORY',   'Xoa danh muc',          'Xoa danh muc'),

  ('b0000000-0000-0000-0006-000000000001', 'CREATE_COMBO',      'Tao combo',             'Tao combo moi'),
  ('b0000000-0000-0000-0006-000000000002', 'VIEW_COMBO',        'Xem combo',             'Xem danh sach combo'),
  ('b0000000-0000-0000-0006-000000000003', 'UPDATE_COMBO',      'Cap nhat combo',        'Chinh sua combo'),
  ('b0000000-0000-0000-0006-000000000004', 'DELETE_COMBO',      'Xoa combo',             'Xoa combo'),

  ('b0000000-0000-0000-0007-000000000001', 'CREATE_MATERIAL',   'Tao vat tu',            'Tao vat tu moi'),
  ('b0000000-0000-0000-0007-000000000002', 'VIEW_MATERIAL',     'Xem vat tu',            'Xem danh sach vat tu'),
  ('b0000000-0000-0000-0007-000000000003', 'UPDATE_MATERIAL',   'Cap nhat vat tu',       'Chinh sua vat tu'),
  ('b0000000-0000-0000-0007-000000000004', 'DELETE_MATERIAL',   'Xoa vat tu',            'Xoa vat tu'),

-- Booking
  ('b0000000-0000-0000-0008-000000000001', 'CREATE_APPOINTMENT','Tao lich hen',          'Tao lich hen moi'),
  ('b0000000-0000-0000-0008-000000000002', 'VIEW_APPOINTMENT',  'Xem lich hen',          'Xem danh sach lich hen'),
  ('b0000000-0000-0000-0008-000000000003', 'UPDATE_APPOINTMENT','Cap nhat lich hen',     'Chinh sua lich hen'),
  ('b0000000-0000-0000-0008-000000000004', 'DELETE_APPOINTMENT','Xoa lich hen',          'Xoa lich hen'),

  ('b0000000-0000-0000-0009-000000000001', 'CREATE_PAYMENT',    'Tao thanh toan',        'Tao thanh toan moi'),
  ('b0000000-0000-0000-0009-000000000002', 'VIEW_PAYMENT',      'Xem thanh toan',        'Xem danh sach thanh toan'),
  ('b0000000-0000-0000-0009-000000000003', 'UPDATE_PAYMENT',    'Cap nhat thanh toan',   'Chinh sua thanh toan'),
  ('b0000000-0000-0000-0009-000000000004', 'DELETE_PAYMENT',    'Xoa thanh toan',        'Xoa thanh toan'),

  ('b0000000-0000-0000-000a-000000000001', 'CREATE_REVIEW',     'Tao danh gia',          'Tao danh gia moi'),
  ('b0000000-0000-0000-000a-000000000002', 'VIEW_REVIEW',       'Xem danh gia',          'Xem danh sach danh gia'),
  ('b0000000-0000-0000-000a-000000000003', 'UPDATE_REVIEW',     'Cap nhat danh gia',     'Chinh sua danh gia'),
  ('b0000000-0000-0000-000a-000000000004', 'DELETE_REVIEW',     'Xoa danh gia',          'Xoa danh gia'),

-- Messaging
  ('b0000000-0000-0000-000b-000000000001', 'CREATE_CONVERSATION','Tao hoi thoai',        'Tao hoi thoai moi'),
  ('b0000000-0000-0000-000b-000000000002', 'VIEW_CONVERSATION',  'Xem hoi thoai',        'Xem danh sach hoi thoai'),
  ('b0000000-0000-0000-000b-000000000003', 'UPDATE_CONVERSATION','Cap nhat hoi thoai',   'Chinh sua hoi thoai'),
  ('b0000000-0000-0000-000b-000000000004', 'DELETE_CONVERSATION','Xoa hoi thoai',        'Xoa hoi thoai'),

  ('b0000000-0000-0000-000c-000000000001', 'CREATE_MESSAGE',    'Tao tin nhan',          'Gui tin nhan moi'),
  ('b0000000-0000-0000-000c-000000000002', 'VIEW_MESSAGE',      'Xem tin nhan',          'Xem danh sach tin nhan'),
  ('b0000000-0000-0000-000c-000000000003', 'UPDATE_MESSAGE',    'Cap nhat tin nhan',     'Chinh sua tin nhan'),
  ('b0000000-0000-0000-000c-000000000004', 'DELETE_MESSAGE',    'Xoa tin nhan',          'Xoa tin nhan'),

-- Staff
  ('b0000000-0000-0000-000d-000000000001', 'CREATE_STAFF_SCHEDULE','Tao lich lam viec',  'Tao lich lam viec nhan vien'),
  ('b0000000-0000-0000-000d-000000000002', 'VIEW_STAFF_SCHEDULE',  'Xem lich lam viec',  'Xem lich lam viec nhan vien'),
  ('b0000000-0000-0000-000d-000000000003', 'UPDATE_STAFF_SCHEDULE','Cap nhat lich lam',  'Chinh sua lich lam viec'),
  ('b0000000-0000-0000-000d-000000000004', 'DELETE_STAFF_SCHEDULE','Xoa lich lam viec',  'Xoa lich lam viec'),

  ('b0000000-0000-0000-000e-000000000001', 'CREATE_STAFF_DAY_OFF','Tao ngay nghi',       'Tao ngay nghi cho nhan vien'),
  ('b0000000-0000-0000-000e-000000000002', 'VIEW_STAFF_DAY_OFF',  'Xem ngay nghi',       'Xem danh sach ngay nghi'),
  ('b0000000-0000-0000-000e-000000000003', 'UPDATE_STAFF_DAY_OFF','Cap nhat ngay nghi',  'Chinh sua ngay nghi'),
  ('b0000000-0000-0000-000e-000000000004', 'DELETE_STAFF_DAY_OFF','Xoa ngay nghi',       'Xoa ngay nghi'),

  ('b0000000-0000-0000-000f-000000000001', 'CREATE_WORKING_HOUR','Tao gio lam viec',     'Tao gio lam viec cua hang'),
  ('b0000000-0000-0000-000f-000000000002', 'VIEW_WORKING_HOUR',  'Xem gio lam viec',     'Xem gio lam viec cua hang'),
  ('b0000000-0000-0000-000f-000000000003', 'UPDATE_WORKING_HOUR','Cap nhat gio lam',     'Chinh sua gio lam viec'),
  ('b0000000-0000-0000-000f-000000000004', 'DELETE_WORKING_HOUR','Xoa gio lam viec',     'Xoa gio lam viec'),

-- Notifications
  ('b0000000-0000-0000-0010-000000000001', 'CREATE_NOTIFICATION','Tao thong bao',        'Tao thong bao moi'),
  ('b0000000-0000-0000-0010-000000000002', 'VIEW_NOTIFICATION',  'Xem thong bao',        'Xem danh sach thong bao'),
  ('b0000000-0000-0000-0010-000000000003', 'UPDATE_NOTIFICATION','Cap nhat thong bao',   'Chinh sua thong bao'),
  ('b0000000-0000-0000-0010-000000000004', 'DELETE_NOTIFICATION','Xoa thong bao',        'Xoa thong bao');


-- ─────────────────────────────────────────────────────────────
-- 3. ROLE ↔ PERMISSION MAPPING
-- ─────────────────────────────────────────────────────────────

-- ========================
-- SUPER_ADMIN → ALL permissions
-- ========================
INSERT IGNORE INTO `RolePermission` (roleId, permissionId)
SELECT 'a0000000-0000-0000-0000-000000000001', id FROM `Permission`;

-- ========================
-- SHOP_OWNER → Full business management (no system-level permission/role CRUD)
-- ========================
INSERT IGNORE INTO `RolePermission` (roleId, permissionId)
SELECT 'a0000000-0000-0000-0000-000000000002', id FROM `Permission`
WHERE code IN (
  -- User management
  'CREATE_USER', 'VIEW_USER', 'UPDATE_USER', 'DELETE_USER',
  -- View roles & permissions (read-only)
  'VIEW_ROLE', 'VIEW_PERMISSION',
  -- Full catalog
  'CREATE_SERVICE',  'VIEW_SERVICE',  'UPDATE_SERVICE',  'DELETE_SERVICE',
  'CREATE_CATEGORY', 'VIEW_CATEGORY', 'UPDATE_CATEGORY', 'DELETE_CATEGORY',
  'CREATE_COMBO',    'VIEW_COMBO',    'UPDATE_COMBO',    'DELETE_COMBO',
  'CREATE_MATERIAL', 'VIEW_MATERIAL', 'UPDATE_MATERIAL', 'DELETE_MATERIAL',
  -- Full booking
  'CREATE_APPOINTMENT', 'VIEW_APPOINTMENT', 'UPDATE_APPOINTMENT', 'DELETE_APPOINTMENT',
  'CREATE_PAYMENT',     'VIEW_PAYMENT',     'UPDATE_PAYMENT',     'DELETE_PAYMENT',
  'VIEW_REVIEW', 'UPDATE_REVIEW', 'DELETE_REVIEW',
  -- Messaging
  'CREATE_CONVERSATION', 'VIEW_CONVERSATION', 'UPDATE_CONVERSATION', 'DELETE_CONVERSATION',
  'CREATE_MESSAGE',      'VIEW_MESSAGE',      'UPDATE_MESSAGE',      'DELETE_MESSAGE',
  -- Full staff
  'CREATE_STAFF_SCHEDULE', 'VIEW_STAFF_SCHEDULE', 'UPDATE_STAFF_SCHEDULE', 'DELETE_STAFF_SCHEDULE',
  'CREATE_STAFF_DAY_OFF',  'VIEW_STAFF_DAY_OFF',  'UPDATE_STAFF_DAY_OFF',  'DELETE_STAFF_DAY_OFF',
  'CREATE_WORKING_HOUR',   'VIEW_WORKING_HOUR',   'UPDATE_WORKING_HOUR',   'DELETE_WORKING_HOUR',
  -- Notifications
  'CREATE_NOTIFICATION', 'VIEW_NOTIFICATION', 'UPDATE_NOTIFICATION', 'DELETE_NOTIFICATION'
);

-- ========================
-- STAFF
-- ========================
INSERT IGNORE INTO `RolePermission` (roleId, permissionId)
SELECT 'a0000000-0000-0000-0000-000000000003', id FROM `Permission`
WHERE code IN (
  -- View catalog (read-only)
  'VIEW_SERVICE', 'VIEW_CATEGORY', 'VIEW_COMBO', 'VIEW_MATERIAL',
  -- Appointments: view + update status
  'VIEW_APPOINTMENT', 'UPDATE_APPOINTMENT',
  -- View payments & reviews
  'VIEW_PAYMENT', 'VIEW_REVIEW',
  -- Messaging
  'CREATE_CONVERSATION', 'VIEW_CONVERSATION',
  'CREATE_MESSAGE',      'VIEW_MESSAGE',
  -- View own schedule
  'VIEW_STAFF_SCHEDULE', 'VIEW_STAFF_DAY_OFF',
  'CREATE_STAFF_DAY_OFF',
  -- Notifications
  'VIEW_NOTIFICATION'
);

-- ========================
-- CUSTOMER
-- ========================
INSERT IGNORE INTO `RolePermission` (roleId, permissionId)
SELECT 'a0000000-0000-0000-0000-000000000004', id FROM `Permission`
WHERE code IN (
  -- Browse catalog
  'VIEW_SERVICE', 'VIEW_CATEGORY', 'VIEW_COMBO',
  -- Book appointments
  'CREATE_APPOINTMENT', 'VIEW_APPOINTMENT',
  -- Payments
  'VIEW_PAYMENT',
  -- Reviews
  'CREATE_REVIEW', 'VIEW_REVIEW',
  -- Messaging (chat voi cua hang)
  'CREATE_CONVERSATION', 'VIEW_CONVERSATION',
  'CREATE_MESSAGE',      'VIEW_MESSAGE',
  -- Notifications
  'VIEW_NOTIFICATION',
  -- View working hours (de biet gio mo cua)
  'VIEW_WORKING_HOUR'
);

-- ========================
-- WAREHOUSE_STAFF (Nhan vien kho)
-- ========================
INSERT IGNORE INTO `RolePermission` (roleId, permissionId)
SELECT 'a0000000-0000-0000-0000-000000000005', id FROM `Permission`
WHERE code IN (
  -- Full material management
  'CREATE_MATERIAL', 'VIEW_MATERIAL', 'UPDATE_MATERIAL', 'DELETE_MATERIAL',
  -- View catalog (reference)
  'VIEW_SERVICE', 'VIEW_COMBO',
  -- Notifications
  'VIEW_NOTIFICATION'
);

COMMIT;