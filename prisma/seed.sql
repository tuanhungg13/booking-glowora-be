-- ============================================================
-- SEED: Roles, Permissions & Role-Permission mapping
-- Idempotent - safe to run multiple times (INSERT IGNORE)
-- MySQL version
-- ============================================================

START TRANSACTION;

-- ─────────────────────────────────────────────────────────────
-- 1. ROLES
-- ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO `roles` (id, code, name, description, is_system, shop_id) VALUES
  ('7b0e395c-e9a3-43c3-9e4e-34aadd5e0b6c', 'SUPER_ADMIN',     'Super Admin',  'Quan tri vien he thong, toan quyen', TRUE, NULL),
  ('a9dc7ae6-6b45-4ed2-a01f-3aad346ab44d', 'SHOP_OWNER',      'Shop Owner',   'Chu cua hang, quan ly toan bo hoat dong', TRUE, NULL),
  ('4a7e7dfe-75b9-406a-9703-1b4be5fffaaa', 'SHOP_STAFF',      'Shop Staff',   'Nhan vien cua hang (thuc hien dich vu)', TRUE, NULL),
  ('c8be51b4-852c-4851-924d-bdefd81b417a', 'CUSTOMER',        'Customer',     'Khach hang dat lich', TRUE, NULL);

-- ─────────────────────────────────────────────────────────────
-- 2. PERMISSIONS
-- ─────────────────────────────────────────────────────────────

-- Identity
INSERT IGNORE INTO `permissions` (id, code, name, description) VALUES
  ('d0deae5f-eb23-45d8-ae75-1c1c26796d84', 'CREATE_USER',       'Tao nguoi dung',        'Tao tai khoan nguoi dung moi'),
  ('75ad7381-2f50-4037-b418-2250ff25ef84', 'VIEW_USER',         'Xem nguoi dung',        'Xem danh sach va chi tiet nguoi dung'),
  ('c7d34e76-daca-40fe-a5fc-83895cf507b7', 'UPDATE_USER',       'Cap nhat nguoi dung',   'Chinh sua thong tin nguoi dung'),
  ('618805fa-787e-4400-8088-2829d7cbcff4', 'DELETE_USER',       'Xoa nguoi dung',        'Xoa tai khoan nguoi dung'),

  ('b24efdca-0e5a-4a11-9560-4c82e1b34809', 'CREATE_ROLE',       'Tao vai tro',           'Tao vai tro moi'),
  ('5b95c1f3-b96f-483e-9750-369e24ad2993', 'VIEW_ROLE',         'Xem vai tro',           'Xem danh sach va chi tiet vai tro'),
  ('45311c0a-5509-463f-9d2b-52c9ed0b3f00', 'UPDATE_ROLE',       'Cap nhat vai tro',      'Chinh sua vai tro'),
  ('66be9d6a-3553-4a60-9e98-922d7dc7aaea', 'DELETE_ROLE',       'Xoa vai tro',           'Xoa vai tro'),

  ('6c2a3a46-fd49-424f-81eb-8e47b1fa20d2', 'CREATE_PERMISSION', 'Tao quyen',             'Tao quyen moi'),
  ('5ebd8b13-5ed6-4f6b-83f5-f3f6c8142555', 'VIEW_PERMISSION',   'Xem quyen',             'Xem danh sach quyen'),
  ('a7832c32-c11b-4218-a4ce-f5961d9f4ba7', 'UPDATE_PERMISSION', 'Cap nhat quyen',        'Chinh sua quyen'),
  ('4f0b9ddf-0998-4552-9b90-e18780209e0d', 'DELETE_PERMISSION', 'Xoa quyen',             'Xoa quyen'),

-- Catalog
  ('91ea3c0a-f3c6-45a0-8f03-46eb42cb4d90', 'CREATE_SERVICE',    'Tao dich vu',           'Tao dich vu moi'),
  ('76459ff4-2f79-4788-82c6-bfbe24f2fcd8', 'VIEW_SERVICE',      'Xem dich vu',           'Xem danh sach dich vu'),
  ('32f23f07-60b6-4a39-ac0e-4b938fc24651', 'UPDATE_SERVICE',    'Cap nhat dich vu',      'Chinh sua dich vu'),
  ('0c37aacf-1740-4756-8910-d646912c680a', 'DELETE_SERVICE',    'Xoa dich vu',           'Xoa dich vu'),

  ('156a86ca-c902-4a18-b961-f8eaf84b569f', 'CREATE_CATEGORY',   'Tao danh muc',          'Tao danh muc moi'),
  ('54b83034-3ebf-4c13-ab03-9d7d169d5d48', 'VIEW_CATEGORY',     'Xem danh muc',          'Xem danh sach danh muc'),
  ('6aa616ce-9c9e-4ca6-8a0a-0ce0b89bdcdb', 'UPDATE_CATEGORY',   'Cap nhat danh muc',     'Chinh sua danh muc'),
  ('3dfc4c12-48a7-4628-b698-83473426713a', 'DELETE_CATEGORY',   'Xoa danh muc',          'Xoa danh muc'),

  ('5ffccb6b-f52d-4eac-95d1-a212f9b5206a', 'CREATE_COMBO',      'Tao combo',             'Tao combo moi'),
  ('d4b0ff2a-5235-4762-9926-f5c828d3a5c5', 'VIEW_COMBO',        'Xem combo',             'Xem danh sach combo'),
  ('bf1637ca-f7a3-4222-89dc-8bb847dcafd8', 'UPDATE_COMBO',      'Cap nhat combo',        'Chinh sua combo'),
  ('b0c525f0-52af-4afc-b11b-2115de41e706', 'DELETE_COMBO',      'Xoa combo',             'Xoa combo'),

-- Booking
  ('79800791-75c3-44cd-b26b-d7ab4ca29003', 'CREATE_APPOINTMENT','Tao lich hen',          'Tao lich hen moi'),
  ('f293aa7f-0846-42da-a0fe-27c74ede7a16', 'VIEW_APPOINTMENT',  'Xem lich hen',          'Xem danh sach lich hen'),
  ('9f8d365d-621a-4d83-9719-979f206d7d4d', 'UPDATE_APPOINTMENT','Cap nhat lich hen',     'Chinh sua lich hen'),
  ('cd3d75c1-0f99-40a0-99f7-6cd510b95d5a', 'DELETE_APPOINTMENT','Xoa lich hen',          'Xoa lich hen'),

  ('fb5d9ea4-2b5f-4aae-8074-2ca2403c49be', 'CREATE_PAYMENT',    'Tao thanh toan',        'Tao thanh toan moi'),
  ('953ed1cc-d680-495a-a687-e810212c08b6', 'VIEW_PAYMENT',      'Xem thanh toan',        'Xem danh sach thanh toan'),
  ('3fae1008-e553-4425-bab4-a5a41ff0c201', 'UPDATE_PAYMENT',    'Cap nhat thanh toan',   'Chinh sua thanh toan'),
  ('453b1673-fe23-46d3-8c11-d93fa83875d4', 'DELETE_PAYMENT',    'Xoa thanh toan',        'Xoa thanh toan'),

  ('0f1a8e41-bff1-49ec-a825-f1b4caac2b4c', 'CREATE_REVIEW',     'Tao danh gia',          'Tao danh gia moi'),
  ('a8bd7fa7-6a7a-4948-8486-639d1f7fd161', 'VIEW_REVIEW',       'Xem danh gia',          'Xem danh sach danh gia'),
  ('720a50f0-3508-4c48-99df-a9e2f972547d', 'UPDATE_REVIEW',     'Cap nhat danh gia',     'Chinh sua danh gia'),
  ('d637fdd1-7432-464b-ac00-484a42f50422', 'DELETE_REVIEW',     'Xoa danh gia',          'Xoa danh gia'),
  ('30b6c2c6-91ad-4923-a9fe-287450954be6', 'MANAGE_REVIEW',     'Quan ly danh gia',      'An hoac hien danh gia vi pham'),

-- Messaging
  ('63426118-c38b-474f-b956-c841094e817c', 'CREATE_CONVERSATION','Tao hoi thoai',        'Tao hoi thoai moi'),
  ('ae542c22-1039-4e3c-8473-77aa2463fb40', 'VIEW_CONVERSATION',  'Xem hoi thoai',        'Xem danh sach hoi thoai'),
  ('a3b18717-d994-4617-9d11-dbcbac5be2ef', 'UPDATE_CONVERSATION','Cap nhat hoi thoai',   'Chinh sua hoi thoai'),
  ('ddeb4424-12e2-4197-9c27-796ee5f1ce0b', 'DELETE_CONVERSATION','Xoa hoi thoai',        'Xoa hoi thoai'),

  ('c8d7e436-d166-48ee-ad86-fa918ded81ab', 'CREATE_MESSAGE',    'Tao tin nhan',          'Gui tin nhan moi'),
  ('38bf3c12-c01d-41b3-b76d-8c1baaaac449', 'VIEW_MESSAGE',      'Xem tin nhan',          'Xem danh sach tin nhan'),
  ('adda1570-fcb6-4418-b519-0cea726cbe68', 'UPDATE_MESSAGE',    'Cap nhat tin nhan',     'Chinh sua tin nhan'),
  ('9cc0f26b-51fa-4be4-b9f5-f008fe9e5421', 'DELETE_MESSAGE',    'Xoa tin nhan',          'Xoa tin nhan'),

-- Staff
  ('eb10a22f-eedd-47b6-83ad-8ce02f38fcdd', 'CREATE_STAFF_SCHEDULE','Tao lich lam viec',  'Tao lich lam viec nhan vien'),
  ('17862880-ef5c-4d55-8331-9683ab87a2bb', 'VIEW_STAFF_SCHEDULE',  'Xem lich lam viec',  'Xem lich lam viec nhan vien'),
  ('cee1ed31-bbac-4887-9351-add6aed386ca', 'UPDATE_STAFF_SCHEDULE','Cap nhat lich lam',  'Chinh sua lich lam viec'),
  ('70a58ac0-8455-4cfc-9a42-9577ddeecfaf', 'DELETE_STAFF_SCHEDULE','Xoa lich lam viec',  'Xoa lich lam viec'),

  ('99d45ffc-361d-4ed0-82cd-9b77d05859d8', 'CREATE_STAFF_DAY_OFF','Tao ngay nghi',       'Tao ngay nghi cho nhan vien'),
  ('6e46d656-ae2b-42da-b296-936528b3ff20', 'VIEW_STAFF_DAY_OFF',  'Xem ngay nghi',       'Xem danh sach ngay nghi'),
  ('de6e6f36-8ce0-4b18-9e89-c080fabb5df0', 'UPDATE_STAFF_DAY_OFF','Cap nhat ngay nghi',  'Chinh sua ngay nghi'),
  ('85de9f10-aeab-4669-a1d1-c51a66355ef7', 'DELETE_STAFF_DAY_OFF','Xoa ngay nghi',       'Xoa ngay nghi'),

  ('4e3159ad-05b0-4ea1-8303-aa725dc7928d', 'CREATE_WORKING_HOUR','Tao gio lam viec',     'Tao gio lam viec cua hang'),
  ('3b973fcf-4562-4d00-8cfc-36669caaaa87', 'VIEW_WORKING_HOUR',  'Xem gio lam viec',     'Xem gio lam viec cua hang'),
  ('2f018e34-243e-45b0-9f04-8d53a497ea97', 'UPDATE_WORKING_HOUR','Cap nhat gio lam',     'Chinh sua gio lam viec'),
  ('832059d8-91de-422d-87c7-11288a98f509', 'DELETE_WORKING_HOUR','Xoa gio lam viec',     'Xoa gio lam viec'),

  ('94cc525a-5f1f-4e44-b4b6-d7d991c88ae0', 'INVITE_STAFF',      'Moi nhan vien',         'Moi nguoi dung vao lam nhan vien cua hang'),
  ('adec169d-dffd-4a64-8549-82633e3a6c74', 'VIEW_STAFF',        'Xem nhan vien',         'Xem danh sach va chi tiet nhan vien'),
  ('fd16d73a-1b37-43f2-bbc8-48246fe2d24a', 'UPDATE_STAFF',      'Cap nhat nhan vien',    'Cap nhat thong tin nhan vien'),
  ('fa743ba5-e260-4257-a408-2b99cfd1618e', 'REMOVE_STAFF',      'Xoa nhan vien',         'Go nhan vien khoi cua hang'),

  ('1f7face3-1783-4679-86c2-ab057a9afb21', 'CREATE_STORE',      'Tao cua hang',          'Tao cua hang moi'),
  ('cdf4ecbd-cc1e-4f74-a53b-34bac4d1f5e2', 'VIEW_STORE',        'Xem cua hang',          'Xem danh sach va chi tiet cua hang'),
  ('4f8d1cf5-ad9d-48a1-8596-beb421d075f0', 'UPDATE_STORE',      'Cap nhat cua hang',     'Cap nhat thong tin cua hang'),
  ('9dc03e86-66fd-4dc8-b92a-936ac12c53c1', 'DELETE_STORE',      'Xoa cua hang',          'Xoa hoac khoa cua hang'),
  ('93117aa4-632f-4ba4-b1db-c47c9fc49b79', 'APPROVE_STORE',     'Duyet cua hang',        'Duyet, tu choi, khoa hoac mo khoa cua hang'),

-- Notifications
  ('80670fb9-7046-4b1a-a665-4248c2dec369', 'CREATE_NOTIFICATION','Tao thong bao',        'Tao thong bao moi'),
  ('3124d68b-9964-412a-8b13-9e9135fade73', 'VIEW_NOTIFICATION',  'Xem thong bao',        'Xem danh sach thong bao'),
  ('ce3f3c75-5cc7-48a6-bd09-bdffcfdb8e2c', 'UPDATE_NOTIFICATION','Cap nhat thong bao',   'Chinh sua thong bao'),
  ('5c31e425-acc7-4ee3-a265-d764ba6951e4', 'DELETE_NOTIFICATION','Xoa thong bao',        'Xoa thong bao');


-- ─────────────────────────────────────────────────────────────
-- 3. ROLE ↔ PERMISSION MAPPING
-- ─────────────────────────────────────────────────────────────

-- ========================
-- SUPER_ADMIN → ALL permissions
-- ========================
INSERT IGNORE INTO `role_permissions` (role_id, permission_id)
SELECT '7b0e395c-e9a3-43c3-9e4e-34aadd5e0b6c', id FROM `permissions`;

-- ========================
-- SHOP_OWNER → Full business management (no system-level permission/role CRUD)
-- ========================
INSERT IGNORE INTO `role_permissions` (role_id, permission_id)
SELECT 'a9dc7ae6-6b45-4ed2-a01f-3aad346ab44d', id FROM `permissions`
WHERE code IN (
  -- User management
  'CREATE_USER', 'VIEW_USER', 'UPDATE_USER', 'DELETE_USER',
  -- View roles & permissions (read-only)
  'VIEW_ROLE', 'VIEW_PERMISSION',
  -- Full catalog
  'CREATE_SERVICE',  'VIEW_SERVICE',  'UPDATE_SERVICE',  'DELETE_SERVICE',
  'CREATE_CATEGORY', 'VIEW_CATEGORY', 'UPDATE_CATEGORY', 'DELETE_CATEGORY',
  'CREATE_COMBO',    'VIEW_COMBO',    'UPDATE_COMBO',    'DELETE_COMBO',
  -- Full booking
  'CREATE_APPOINTMENT', 'VIEW_APPOINTMENT', 'UPDATE_APPOINTMENT', 'DELETE_APPOINTMENT',
  'CREATE_PAYMENT',     'VIEW_PAYMENT',     'UPDATE_PAYMENT',     'DELETE_PAYMENT',
  'VIEW_REVIEW', 'UPDATE_REVIEW', 'DELETE_REVIEW', 'MANAGE_REVIEW',
  -- Messaging
  'CREATE_CONVERSATION', 'VIEW_CONVERSATION', 'UPDATE_CONVERSATION', 'DELETE_CONVERSATION',
  'CREATE_MESSAGE',      'VIEW_MESSAGE',      'UPDATE_MESSAGE',      'DELETE_MESSAGE',
  -- Full staff
  'INVITE_STAFF', 'VIEW_STAFF', 'UPDATE_STAFF', 'REMOVE_STAFF',
  'CREATE_STAFF_SCHEDULE', 'VIEW_STAFF_SCHEDULE', 'UPDATE_STAFF_SCHEDULE', 'DELETE_STAFF_SCHEDULE',
  'CREATE_STAFF_DAY_OFF',  'VIEW_STAFF_DAY_OFF',  'UPDATE_STAFF_DAY_OFF',  'DELETE_STAFF_DAY_OFF',
  'CREATE_WORKING_HOUR',   'VIEW_WORKING_HOUR',   'UPDATE_WORKING_HOUR',   'DELETE_WORKING_HOUR',
  -- Notifications
  'CREATE_NOTIFICATION', 'VIEW_NOTIFICATION', 'UPDATE_NOTIFICATION', 'DELETE_NOTIFICATION',
  -- Store management
  'CREATE_STORE', 'VIEW_STORE', 'UPDATE_STORE', 'DELETE_STORE', 'APPROVE_STORE'
);

-- ========================
-- SHOP_STAFF
-- ========================
INSERT IGNORE INTO `role_permissions` (role_id, permission_id)
SELECT '4a7e7dfe-75b9-406a-9703-1b4be5fffaaa', id FROM `permissions`
WHERE code IN (
  -- View catalog (read-only)
  'VIEW_SERVICE', 'VIEW_CATEGORY', 'VIEW_COMBO',
  'VIEW_STAFF',
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
INSERT IGNORE INTO `role_permissions` (role_id, permission_id)
SELECT 'c8be51b4-852c-4851-924d-bdefd81b417a', id FROM `permissions`
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
  'VIEW_WORKING_HOUR',
  -- Become owner flow
  'CREATE_STORE', 'VIEW_STORE'
);

COMMIT;
