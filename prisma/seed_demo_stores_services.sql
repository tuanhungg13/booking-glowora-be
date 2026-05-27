-- ============================================================
-- DEMO SEED: 2 stores, 20 Vietnamese services, detailed variants
-- Target: MySQL/MariaDB schema generated from prisma/schema.prisma
-- Safe to re-run: fixed UUIDs + ON DUPLICATE KEY UPDATE
-- ============================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @demo_password_hash = '$2b$10$4rNY01kLNBZFcBWQuq.Rsu5P9g490SvP0fZ6PoftwySYtMQTKw/Dq'; -- Owner@123456

SET @owner1_seed_id = 'eb46360c-dcad-4eb9-b80f-b8994e3c3aba';
SET @owner2_seed_id = '901a3089-3b25-4e3c-9b6d-bebd1b572b99';
SET @store1_id = 'de32e6f3-e8a7-471a-9886-358c9b628454';
SET @store2_id = 'fa852aaa-2f74-4bc9-ae01-7b63278d8657';
SET @store1_owner_role_id = '675aa50a-af3a-457b-a90e-8c218270a073';
SET @store2_owner_role_id = '32c73290-6ea0-4166-8335-82450308c382';
SET @store1_staff_role_id = '89e2897b-5f0a-42dd-9dca-48947bfbd4ad';
SET @store2_staff_role_id = '9b56842c-f53e-4ab5-ba8b-80c5898d9112';

SET @store1_staff_user1_id = '5c84d411-5ae8-4845-a065-6b8e8a3ff91d';
SET @store1_staff_user2_id = 'dc08e5bb-5063-4084-9164-dbfcb5b86b4c';
SET @store1_staff_user3_id = 'c40ba78e-c226-4853-af07-dd489bf2408e';
SET @store2_staff_user1_id = '79cc02ac-232d-4446-b93e-5ac9a48a2882';
SET @store2_staff_user2_id = 'a94567ac-2489-4da4-b176-9d5104228a6b';
SET @store2_staff_user3_id = 'a07793e4-ac0f-4e37-93bf-a5c6dcae5989';

SET @store1_staff1_id = 'edb081c2-8928-4e7f-b4e0-c2d234616b2f';
SET @store1_staff2_id = '32cecc95-4f4c-4e74-90eb-57c4ef2308b6';
SET @store1_staff3_id = 'a14c577d-66d4-45f6-8726-252402c3e332';
SET @store2_staff1_id = 'cd6ec0a2-0b2d-48cd-a1e1-1a81b4565f67';
SET @store2_staff2_id = '6b39788d-54c8-4817-8d93-d2d6207c6ecc';
SET @store2_staff3_id = 'a31b01d2-1e44-43b7-95a3-3b5de7a5ac8b';

SET @cat_facial = 'a4fcc6ee-d92c-45fe-955e-ccf9e79d8018';
SET @cat_massage = '6b080aec-2e5a-4327-8054-66c554b9ffa9';
SET @cat_body = '2f01ee6f-9bda-4786-a897-5084c941a8b8';
SET @cat_nail_lash = '2307b047-f377-41fa-a877-9835389c7d8a';
SET @cat_waxing = '379f6d4f-910b-4d7a-9e67-f7fbb4d7df8a';
SET @cat_wellness = '1ab98804-4324-4f18-805f-00ef8c07439b';

-- Owners
INSERT INTO `users` (`id`, `full_name`, `email`, `password`, `phone`, `status`, `created_at`, `updated_at`) VALUES
  (@owner1_seed_id, 'Nguyễn Minh Anh', 'owner.lumina@example.com', @demo_password_hash, '0901001001', 'ACTIVE', NOW(), NOW()),
  (@owner2_seed_id, 'Trần Hoài An', 'owner.annhien@example.com', @demo_password_hash, '0901001002', 'ACTIVE', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `full_name` = VALUES(`full_name`),
  `password` = VALUES(`password`),
  `phone` = VALUES(`phone`),
  `status` = VALUES(`status`),
  `updated_at` = NOW();

SET @owner1_id = (SELECT `id` FROM `users` WHERE `email` = 'owner.lumina@example.com' LIMIT 1);
SET @owner2_id = (SELECT `id` FROM `users` WHERE `email` = 'owner.annhien@example.com' LIMIT 1);

-- Shared service categories
INSERT INTO `service_categories` (`id`, `name`, `slug`, `description`, `created_at`, `updated_at`) VALUES
  (@cat_facial, 'Chăm sóc da mặt', 'cham-soc-da-mat', 'Các liệu trình làm sạch, phục hồi, điều trị và nuôi dưỡng da mặt.', NOW(), NOW()),
  (@cat_massage, 'Massage và trị liệu', 'massage-va-tri-lieu', 'Dịch vụ massage thư giãn, trị liệu cổ vai gáy, đá nóng và tinh dầu.', NOW(), NOW()),
  (@cat_body, 'Chăm sóc cơ thể', 'cham-soc-co-the', 'Tẩy tế bào chết, ủ dưỡng, tắm trắng và các liệu trình body chuyên sâu.', NOW(), NOW()),
  (@cat_nail_lash, 'Nail và mi', 'nail-va-mi', 'Chăm sóc móng, sơn gel, nối mi và tạo kiểu mi thẩm mỹ.', NOW(), NOW()),
  (@cat_waxing, 'Triệt lông và waxing', 'triet-long-va-waxing', 'Triệt lông công nghệ lạnh và waxing bằng sáp ấm dịu nhẹ.', NOW(), NOW()),
  (@cat_wellness, 'Dưỡng sinh', 'duong-sinh', 'Gội đầu dưỡng sinh, chăm sóc đầu cổ vai gáy và thư giãn thảo dược.', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `updated_at` = NOW();

-- Stores
INSERT INTO `stores` (
  `id`, `slug`, `owner_id`, `name`, `phone`, `email`, `website`, `description`,
  `address`, `city`, `district`, `latitude`, `longitude`, `status`, `approved_at`,
  `timezone`, `slot_interval_mins`, `cancel_before_hours`, `max_advance_days`,
  `auto_confirm`, `avg_rating`, `total_reviews`, `created_at`, `updated_at`
) VALUES
  (
    @store1_id, 'lumina-skin-spa-ho-chi-minh', @owner1_id, 'Lumina Skin & Spa',
    '02871010001', 'hello@lumina-spa.vn', 'https://lumina-spa.vn',
    'Spa chăm sóc da và thư giãn tại Quận 1, tập trung vào liệu trình da mặt chuyên sâu, massage trị liệu và chăm sóc body bằng sản phẩm dịu nhẹ.',
    '28 Nguyễn Trãi, Phường Bến Thành', 'Hồ Chí Minh', 'Quận 1',
    10.770120, 106.693420, 'ACTIVE', NOW(), 'Asia/Ho_Chi_Minh',
    30, 2, 30, 1, 4.80, 128, NOW(), NOW()
  ),
  (
    @store2_id, 'an-nhien-beauty-lounge-ha-noi', @owner2_id, 'An Nhiên Beauty Lounge',
    '02471010002', 'hello@annhien-beauty.vn', 'https://annhien-beauty.vn',
    'Beauty lounge tại Ba Đình với dịch vụ da mặt, dưỡng sinh, massage thư giãn và chăm sóc sắc đẹp theo phong cách nhẹ nhàng, riêng tư.',
    '16 Phan Đình Phùng, Phường Quán Thánh', 'Hà Nội', 'Ba Đình',
    21.039210, 105.840320, 'ACTIVE', NOW(), 'Asia/Ho_Chi_Minh',
    30, 2, 45, 1, 4.75, 96, NOW(), NOW()
  )
ON DUPLICATE KEY UPDATE
  `owner_id` = VALUES(`owner_id`),
  `name` = VALUES(`name`),
  `phone` = VALUES(`phone`),
  `email` = VALUES(`email`),
  `website` = VALUES(`website`),
  `description` = VALUES(`description`),
  `address` = VALUES(`address`),
  `city` = VALUES(`city`),
  `district` = VALUES(`district`),
  `latitude` = VALUES(`latitude`),
  `longitude` = VALUES(`longitude`),
  `status` = VALUES(`status`),
  `approved_at` = VALUES(`approved_at`),
  `timezone` = VALUES(`timezone`),
  `slot_interval_mins` = VALUES(`slot_interval_mins`),
  `cancel_before_hours` = VALUES(`cancel_before_hours`),
  `max_advance_days` = VALUES(`max_advance_days`),
  `auto_confirm` = VALUES(`auto_confirm`),
  `avg_rating` = VALUES(`avg_rating`),
  `total_reviews` = VALUES(`total_reviews`),
  `updated_at` = NOW();

-- Working hours for both stores
INSERT INTO `working_hours` (`id`, `store_id`, `day_of_week`, `open_time`, `close_time`, `is_closed`) VALUES
  ('beb86a0d-0369-4387-bea0-14069568b240', @store1_id, 'MONDAY', '09:00', '21:00', 0),
  ('eb7b1f2b-9ff5-4c22-b625-7159b3df676e', @store1_id, 'TUESDAY', '09:00', '21:00', 0),
  ('7930a955-6827-4fa9-b56c-422d8d75b1b9', @store1_id, 'WEDNESDAY', '09:00', '21:00', 0),
  ('04a5b22a-08d3-473e-9006-b546dd6bab57', @store1_id, 'THURSDAY', '09:00', '21:00', 0),
  ('ce898e55-a912-4dbe-954a-0a8e395c6893', @store1_id, 'FRIDAY', '09:00', '21:00', 0),
  ('90b63890-4511-4e6d-9efc-e7d142715d6d', @store1_id, 'SATURDAY', '08:30', '21:30', 0),
  ('f1568e01-5bd0-4eab-90c9-7a3dc947cc3d', @store1_id, 'SUNDAY', '09:00', '18:00', 0),
  ('dc2d9342-3c7a-4562-84bf-030f2d5a2b06', @store2_id, 'MONDAY', '09:00', '20:30', 0),
  ('a2ca906b-6c41-4e5d-b11e-70ca3178ead2', @store2_id, 'TUESDAY', '09:00', '20:30', 0),
  ('c7033d73-828a-4f34-a185-129f97d8ef56', @store2_id, 'WEDNESDAY', '09:00', '20:30', 0),
  ('31a0c8f5-67ef-445f-a546-4d86a55a2715', @store2_id, 'THURSDAY', '09:00', '20:30', 0),
  ('5b446268-1473-4a2d-ace9-73b27f0b4034', @store2_id, 'FRIDAY', '09:00', '20:30', 0),
  ('919f25df-bc2c-4adc-a5b3-b13bf6719b4d', @store2_id, 'SATURDAY', '08:30', '21:00', 0),
  ('68f4f385-373f-4e52-9157-77b69a304f66', @store2_id, 'SUNDAY', '09:00', '17:30', 0)
ON DUPLICATE KEY UPDATE
  `open_time` = VALUES(`open_time`),
  `close_time` = VALUES(`close_time`),
  `is_closed` = VALUES(`is_closed`);

-- Store-scoped owner roles. Permissions are copied only if the system SHOP_OWNER role already exists.
INSERT INTO `roles` (`id`, `name`, `code`, `description`, `is_system`, `shop_id`) VALUES
  (@store1_owner_role_id, 'Shop Owner', 'SHOP_OWNER', 'Chủ cửa hàng Lumina Skin & Spa', 0, @store1_id),
  (@store2_owner_role_id, 'Shop Owner', 'SHOP_OWNER', 'Chủ cửa hàng An Nhiên Beauty Lounge', 0, @store2_id)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `code` = VALUES(`code`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`);

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @store1_owner_role_id, `rp`.`permission_id`
FROM `role_permissions` `rp`
JOIN `roles` `r` ON `r`.`id` = `rp`.`role_id`
WHERE `r`.`code` = 'SHOP_OWNER' AND `r`.`shop_id` IS NULL
ON DUPLICATE KEY UPDATE `permission_id` = `role_permissions`.`permission_id`;

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @store2_owner_role_id, `rp`.`permission_id`
FROM `role_permissions` `rp`
JOIN `roles` `r` ON `r`.`id` = `rp`.`role_id`
WHERE `r`.`code` = 'SHOP_OWNER' AND `r`.`shop_id` IS NULL
ON DUPLICATE KEY UPDATE `permission_id` = `role_permissions`.`permission_id`;

INSERT INTO `user_roles` (`id`, `user_id`, `role_id`, `shop_id`, `created_at`) VALUES
  ('96dd45ee-8ba8-45ad-a41b-3277f4c6d0b8', @owner1_id, @store1_owner_role_id, @store1_id, NOW()),
  ('2d9b43ee-2964-4822-a15f-850660e341b6', @owner2_id, @store2_owner_role_id, @store2_id, NOW())
ON DUPLICATE KEY UPDATE
  `user_id` = VALUES(`user_id`),
  `role_id` = VALUES(`role_id`),
  `shop_id` = VALUES(`shop_id`);

-- Store-scoped staff roles and demo staff members.
INSERT INTO `roles` (`id`, `name`, `code`, `description`, `is_system`, `shop_id`) VALUES
  (@store1_staff_role_id, 'Shop Staff', 'SHOP_STAFF', 'Nhan vien Lumina Skin & Spa', 0, @store1_id),
  (@store2_staff_role_id, 'Shop Staff', 'SHOP_STAFF', 'Nhan vien An Nhien Beauty Lounge', 0, @store2_id)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `code` = VALUES(`code`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`);

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @store1_staff_role_id, `rp`.`permission_id`
FROM `role_permissions` `rp`
JOIN `roles` `r` ON `r`.`id` = `rp`.`role_id`
WHERE `r`.`code` = 'SHOP_STAFF' AND `r`.`shop_id` IS NULL
ON DUPLICATE KEY UPDATE `permission_id` = `role_permissions`.`permission_id`;

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @store2_staff_role_id, `rp`.`permission_id`
FROM `role_permissions` `rp`
JOIN `roles` `r` ON `r`.`id` = `rp`.`role_id`
WHERE `r`.`code` = 'SHOP_STAFF' AND `r`.`shop_id` IS NULL
ON DUPLICATE KEY UPDATE `permission_id` = `role_permissions`.`permission_id`;

INSERT INTO `users` (`id`, `full_name`, `email`, `password`, `phone`, `status`, `created_at`, `updated_at`) VALUES
  (@store1_staff_user1_id, 'Le Thao Linh', 'staff.lumina.linh@example.com', @demo_password_hash, '0912001001', 'ACTIVE', NOW(), NOW()),
  (@store1_staff_user2_id, 'Pham Ngoc Han', 'staff.lumina.han@example.com', @demo_password_hash, '0912001002', 'ACTIVE', NOW(), NOW()),
  (@store1_staff_user3_id, 'Vo Mai Phuong', 'staff.lumina.phuong@example.com', @demo_password_hash, '0912001003', 'ACTIVE', NOW(), NOW()),
  (@store2_staff_user1_id, 'Do Thu Ha', 'staff.annhien.ha@example.com', @demo_password_hash, '0912002001', 'ACTIVE', NOW(), NOW()),
  (@store2_staff_user2_id, 'Nguyen Bao Chau', 'staff.annhien.chau@example.com', @demo_password_hash, '0912002002', 'ACTIVE', NOW(), NOW()),
  (@store2_staff_user3_id, 'Hoang Minh Khue', 'staff.annhien.khue@example.com', @demo_password_hash, '0912002003', 'ACTIVE', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `full_name` = VALUES(`full_name`),
  `password` = VALUES(`password`),
  `phone` = VALUES(`phone`),
  `status` = VALUES(`status`),
  `updated_at` = NOW();

INSERT INTO `staff` (`id`, `user_id`, `store_id`, `specialty`, `bio`, `rating`, `total_reviews`, `status`, `created_at`, `updated_at`) VALUES
  (@store1_staff1_id, @store1_staff_user1_id, @store1_id, 'Facial therapy', 'Chuyen cham soc da mat, phuc hoi va cap am.', 4.82, 41, 'ACTIVE', NOW(), NOW()),
  (@store1_staff2_id, @store1_staff_user2_id, @store1_id, 'Massage therapy', 'Manh ve massage tri lieu, da nong va thu gian toan than.', 4.88, 53, 'ACTIVE', NOW(), NOW()),
  (@store1_staff3_id, @store1_staff_user3_id, @store1_id, 'Body, nail and waxing', 'Phu trach body care, nail gel va waxing cong nghe lanh.', 4.76, 34, 'ACTIVE', NOW(), NOW()),
  (@store2_staff1_id, @store2_staff_user1_id, @store2_id, 'Anti-aging facial', 'Chuyen lieu trinh collagen, peel diu nhe va cham soc da lung.', 4.84, 38, 'ACTIVE', NOW(), NOW()),
  (@store2_staff2_id, @store2_staff_user2_id, @store2_id, 'Wellness and maternity massage', 'Chuyen duong sinh dau vai gay va massage bau an toan.', 4.86, 45, 'ACTIVE', NOW(), NOW()),
  (@store2_staff3_id, @store2_staff_user3_id, @store2_id, 'Nail, lash and body care', 'Phu trach noi mi, son gel, waxing va cham soc body.', 4.73, 29, 'ACTIVE', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `user_id` = VALUES(`user_id`),
  `store_id` = VALUES(`store_id`),
  `specialty` = VALUES(`specialty`),
  `bio` = VALUES(`bio`),
  `rating` = VALUES(`rating`),
  `total_reviews` = VALUES(`total_reviews`),
  `status` = VALUES(`status`),
  `updated_at` = NOW();

INSERT INTO `user_roles` (`id`, `user_id`, `role_id`, `shop_id`, `created_at`) VALUES
  ('885bb5d2-b34f-42b2-95cf-83a7fec5a3c6', @store1_staff_user1_id, @store1_staff_role_id, @store1_id, NOW()),
  ('700e4044-4be9-425d-a839-f9b4629e3589', @store1_staff_user2_id, @store1_staff_role_id, @store1_id, NOW()),
  ('04992bac-f5d3-4ca6-bba6-8fa1ad366d9f', @store1_staff_user3_id, @store1_staff_role_id, @store1_id, NOW()),
  ('1a293355-c1ba-44cc-ae73-1ebcc594e9e4', @store2_staff_user1_id, @store2_staff_role_id, @store2_id, NOW()),
  ('2f3c9944-0383-40bd-982b-4529a48a7d56', @store2_staff_user2_id, @store2_staff_role_id, @store2_id, NOW()),
  ('16435744-9f94-4186-a346-86e5086f01a2', @store2_staff_user3_id, @store2_staff_role_id, @store2_id, NOW())
ON DUPLICATE KEY UPDATE
  `user_id` = VALUES(`user_id`),
  `role_id` = VALUES(`role_id`),
  `shop_id` = VALUES(`shop_id`);

-- Services: Store 1 - Lumina Skin & Spa
INSERT INTO `services` (`id`, `shop_id`, `category_id`, `name`, `slug`, `description`, `image_url`, `status`, `avg_rating`, `created_at`, `updated_at`) VALUES
  ('ec8f9400-b3ff-4134-bfe1-7cb1aadadcf6', @store1_id, @cat_facial, 'Chăm sóc da mặt sạch sâu và cấp ẩm phục hồi', 'cham-soc-da-mat-sach-sau-cap-am-phuc-hoi', 'Làm sạch da nhiều bước, lấy bã nhờn nhẹ nhàng, cân bằng độ ẩm và phục hồi hàng rào bảo vệ da bằng mặt nạ cấp nước.', NULL, 'ACTIVE', 4.85, NOW(), NOW()),
  ('e9d8109b-526a-471e-96d4-315a168a381e', @store1_id, @cat_facial, 'Điều trị mụn chuyên sâu giảm viêm', 'dieu-tri-mun-chuyen-sau-giam-viem', 'Liệu trình hỗ trợ da mụn gồm làm sạch, xông hơi, xử lý nhân mụn đúng kỹ thuật, điện di làm dịu và hướng dẫn chăm sóc tại nhà.', NULL, 'ACTIVE', 4.82, NOW(), NOW()),
  ('eb157ec6-2f97-43d9-9158-3548743eff0a', @store1_id, @cat_massage, 'Massage thư giãn toàn thân hương tinh dầu', 'massage-thu-gian-toan-than-huong-tinh-dau', 'Massage toàn thân với lực vừa phải, kết hợp tinh dầu thiên nhiên giúp giảm căng cơ, thư giãn thần kinh và cải thiện chất lượng giấc ngủ.', NULL, 'ACTIVE', 4.90, NOW(), NOW()),
  ('cce51510-f47f-45a9-8d72-0a42e481aaca', @store1_id, @cat_wellness, 'Gội đầu dưỡng sinh cổ vai gáy', 'goi-dau-duong-sinh-co-vai-gay', 'Gội đầu thảo mộc kết hợp massage da đầu, bấm huyệt cổ vai gáy và chườm ấm giúp thư giãn sau thời gian làm việc dài.', NULL, 'ACTIVE', 4.78, NOW(), NOW()),
  ('a80289b4-7fe3-46d3-a529-cda9aa279be5', @store1_id, @cat_body, 'Tẩy tế bào chết và ủ dưỡng trắng sáng body', 'tay-te-bao-chet-u-duong-trang-sang-body', 'Làm sạch lớp sừng già, massage body và ủ dưỡng bằng hoạt chất làm sáng dịu nhẹ để da mịn và đều màu hơn.', NULL, 'ACTIVE', 4.74, NOW(), NOW()),
  ('80269ef7-9c19-47c0-b45c-d381e58e7c76', @store1_id, @cat_waxing, 'Triệt lông nách công nghệ lạnh', 'triet-long-nach-cong-nghe-lanh', 'Triệt lông vùng nách bằng đầu lạnh hỗ trợ giảm cảm giác nóng rát, phù hợp liệu trình duy trì định kỳ.', NULL, 'ACTIVE', 4.70, NOW(), NOW()),
  ('30f47786-2f8c-4559-8121-8a02124d1e36', @store1_id, @cat_nail_lash, 'Chăm sóc móng tay gel màu cơ bản', 'cham-soc-mong-tay-gel-mau-co-ban', 'Cắt da, tạo dáng móng, dưỡng biểu bì và sơn gel một màu với lớp phủ bóng bền màu.', NULL, 'ACTIVE', 4.66, NOW(), NOW()),
  ('e70b5b30-6a3b-4164-aef1-1e9ad8fe97cb', @store1_id, @cat_facial, 'Phun oxy tươi cấp ẩm tức thì', 'phun-oxy-tuoi-cap-am-tuc-thi', 'Cấp ẩm nhanh bằng oxy tươi và serum dịu nhẹ, phù hợp da thiếu nước, xỉn màu hoặc cần làm dịu trước sự kiện.', NULL, 'ACTIVE', 4.72, NOW(), NOW()),
  ('7c250a50-b132-4c6a-8ed7-972f8bca573c', @store1_id, @cat_massage, 'Massage đá nóng trị liệu vùng lưng', 'massage-da-nong-tri-lieu-vung-lung', 'Tập trung vùng lưng, vai và thắt lưng với đá nóng, dầu nền và động tác miết sâu nhằm giảm mỏi cơ.', NULL, 'ACTIVE', 4.81, NOW(), NOW()),
  ('ff80f24d-14fe-4c44-a93a-b5dbe07e8d83', @store1_id, @cat_body, 'Tắm trắng thảo mộc thiên nhiên', 'tam-trang-thao-moc-thien-nhien', 'Làm sạch, massage và ủ body bằng hỗn hợp thảo mộc thiên nhiên, giúp da mềm và sáng khỏe dần theo liệu trình.', NULL, 'ACTIVE', 4.69, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `category_id` = VALUES(`category_id`),
  `name` = VALUES(`name`),
  `slug` = VALUES(`slug`),
  `description` = VALUES(`description`),
  `image_url` = VALUES(`image_url`),
  `status` = VALUES(`status`),
  `avg_rating` = VALUES(`avg_rating`),
  `updated_at` = NOW();

-- Services: Store 2 - An Nhiên Beauty Lounge
INSERT INTO `services` (`id`, `shop_id`, `category_id`, `name`, `slug`, `description`, `image_url`, `status`, `avg_rating`, `created_at`, `updated_at`) VALUES
  ('9379b193-46e7-4a62-879b-c7dfe254b525', @store2_id, @cat_facial, 'Chăm sóc da mặt chống lão hóa collagen', 'cham-soc-da-mat-chong-lao-hoa-collagen', 'Liệu trình làm sạch, massage nâng cơ nhẹ, điện di collagen và mặt nạ phục hồi nhằm cải thiện độ căng mịn cho da trưởng thành.', NULL, 'ACTIVE', 4.86, NOW(), NOW()),
  ('820f7e87-eded-4f55-b06d-37e7027cf4fd', @store2_id, @cat_facial, 'Peel da sinh học tái tạo bề mặt', 'peel-da-sinh-hoc-tai-tao-be-mat', 'Peel sinh học nồng độ phù hợp từng nền da, hỗ trợ làm mịn bề mặt, giảm bít tắc và cải thiện sắc tố không đều.', NULL, 'ACTIVE', 4.79, NOW(), NOW()),
  ('86119eff-efaf-4e0f-9393-346494e72b27', @store2_id, @cat_massage, 'Massage bầu thư giãn an toàn cho mẹ', 'massage-bau-thu-gian-an-toan-cho-me', 'Massage chuyên biệt cho mẹ bầu với tư thế hỗ trợ, lực nhẹ và dầu nền dịu mùi giúp giảm mỏi lưng, chân và vai gáy.', NULL, 'ACTIVE', 4.88, NOW(), NOW()),
  ('03744b2b-6616-401f-9d56-43f3dd8fc95b', @store2_id, @cat_wellness, 'Dưỡng sinh đầu vai gáy bằng thảo dược nóng', 'duong-sinh-dau-vai-gay-bang-thao-duoc-nong', 'Chăm sóc đầu cổ vai gáy bằng dầu thảo dược, chườm nóng và kỹ thuật day ấn huyệt giúp cơ thể thư giãn sâu.', NULL, 'ACTIVE', 4.83, NOW(), NOW()),
  ('e626c717-a57b-48cb-a0b5-4f5f66271ef1', @store2_id, @cat_body, 'Liệu trình giảm béo bụng công nghệ RF', 'lieu-trinh-giam-beo-bung-cong-nghe-rf', 'Kết hợp làm nóng RF, massage dẫn lưu và gel săn chắc nhằm hỗ trợ giảm số đo vùng bụng theo liệu trình.', NULL, 'ACTIVE', 4.71, NOW(), NOW()),
  ('7edec950-6d82-4b46-9a93-a56b80b99842', @store2_id, @cat_nail_lash, 'Nối mi lụa tự nhiên phong cách Hàn Quốc', 'noi-mi-lua-tu-nhien-phong-cach-han-quoc', 'Nối mi sợi mảnh, dáng tự nhiên, cân chỉnh theo khuôn mắt để tạo hiệu ứng mềm và nhẹ.', NULL, 'ACTIVE', 4.76, NOW(), NOW()),
  ('14de4fe4-d681-40d6-82d9-c8125caa3c59', @store2_id, @cat_waxing, 'Wax lông tay chân bằng sáp ấm dịu nhẹ', 'wax-long-tay-chan-bang-sap-am-diu-nhe', 'Wax lông tay hoặc chân bằng sáp ấm, làm sạch da trước và sau dịch vụ, thoa gel làm dịu để giảm kích ứng.', NULL, 'ACTIVE', 4.64, NOW(), NOW()),
  ('477a1ffb-8b61-4e5d-bada-7534a3c1bb3a', @store2_id, @cat_facial, 'Chăm sóc da lưng làm sạch mụn', 'cham-soc-da-lung-lam-sach-mun', 'Làm sạch da lưng, tẩy tế bào chết, xử lý mụn phù hợp và đắp mặt nạ khoáng giúp vùng lưng thông thoáng hơn.', NULL, 'ACTIVE', 4.73, NOW(), NOW()),
  ('5429a681-1e38-4aab-b1e7-57b6abcd5808', @store2_id, @cat_nail_lash, 'Sơn gel chân và chăm sóc gót mềm', 'son-gel-chan-cham-soc-got-mem', 'Ngâm chân, làm sạch móng, xử lý da khô vùng gót và sơn gel chân một màu hoặc nhũ nhẹ.', NULL, 'ACTIVE', 4.67, NOW(), NOW()),
  ('386952be-68a5-4684-b50e-d1ce1177a3a9', @store2_id, @cat_body, 'Tắm ủ body yến mạch làm dịu da', 'tam-u-body-yen-mach-lam-diu-da', 'Tắm ủ body với yến mạch và sữa dưỡng dịu nhẹ, phù hợp da khô, da dễ kích ứng hoặc cần phục hồi sau nắng.', NULL, 'ACTIVE', 4.68, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `category_id` = VALUES(`category_id`),
  `name` = VALUES(`name`),
  `slug` = VALUES(`slug`),
  `description` = VALUES(`description`),
  `image_url` = VALUES(`image_url`),
  `status` = VALUES(`status`),
  `avg_rating` = VALUES(`avg_rating`),
  `updated_at` = NOW();

-- Variants: Store 1. Five services have 3 variants, remaining services have 1 variant.
INSERT INTO `service_variants` (`id`, `service_id`, `name`, `description`, `duration`, `price`, `cost_price`, `sort_order`, `status`, `created_at`, `updated_at`) VALUES
  ('ea22193c-439a-4b68-b538-9d3848349ac3', 'ec8f9400-b3ff-4134-bfe1-7cb1aadadcf6', 'Gói tiêu chuẩn 60 phút', 'Làm sạch, tẩy tế bào chết nhẹ, hút bã nhờn vùng chữ T, mặt nạ cấp ẩm và kem khóa ẩm.', 60, 420000.00, 180000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('691612cb-f0b4-4a14-9b18-3bcd27ad5b00', 'ec8f9400-b3ff-4134-bfe1-7cb1aadadcf6', 'Gói chuyên sâu 75 phút', 'Thêm xông hơi, lấy nhân mụn nhẹ, điện di serum HA và massage nâng cơ mặt.', 75, 590000.00, 250000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('8f1a94d1-3617-4c55-acf7-8e578fa9d0b6', 'ec8f9400-b3ff-4134-bfe1-7cb1aadadcf6', 'Gói cao cấp 90 phút', 'Bổ sung tinh chất phục hồi, mặt nạ chuyên biệt theo nền da và chăm sóc cổ vai gáy ngắn.', 90, 780000.00, 330000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('bf8129e4-e69d-4d8e-a282-61495d24e376', 'e9d8109b-526a-471e-96d4-315a168a381e', 'Gói nền tảng 75 phút', 'Làm sạch sâu, xông hơi, xử lý nhân mụn chọn lọc, sát khuẩn và mặt nạ làm dịu.', 75, 560000.00, 230000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('24980dca-5eeb-413c-ac32-c084f8d6b1c3', 'e9d8109b-526a-471e-96d4-315a168a381e', 'Gói chuyên sâu 90 phút', 'Thêm chiếu ánh sáng xanh, điện di phục hồi và serum giảm viêm cho da mụn nhạy cảm.', 90, 720000.00, 310000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('485035d4-d566-4c68-84cf-f57ea8eee059', 'e9d8109b-526a-471e-96d4-315a168a381e', 'Gói theo phác đồ 120 phút', 'Đánh giá da, xử lý mụn kỹ hơn, làm dịu nhiều bước và tư vấn lịch chăm sóc trong 4 tuần.', 120, 980000.00, 430000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('b74f34c9-6a9c-4596-a80a-6fa58a365692', 'eb157ec6-2f97-43d9-9158-3548743eff0a', 'Gói thư giãn 60 phút', 'Massage toàn thân lực nhẹ đến vừa với tinh dầu lavender, tập trung lưng, chân và vai.', 60, 520000.00, 210000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('32667007-db05-4a11-9fe4-49df256006ba', 'eb157ec6-2f97-43d9-9158-3548743eff0a', 'Gói cân bằng 90 phút', 'Massage toàn thân đầy đủ, thêm chườm ấm vùng lưng và kéo giãn nhẹ cuối buổi.', 90, 760000.00, 320000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('55c9f235-38dd-4e13-bebd-afb4aac784c7', 'eb157ec6-2f97-43d9-9158-3548743eff0a', 'Gói ngủ ngon 120 phút', 'Massage sâu hơn, chăm sóc bàn chân, da đầu và tinh dầu ấm giúp cơ thể thả lỏng lâu hơn.', 120, 980000.00, 430000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('7b83ef8c-0de1-4b70-a56b-ac672e6e049f', 'cce51510-f47f-45a9-8d72-0a42e481aaca', 'Gói cơ bản 45 phút', 'Gội thảo mộc, massage da đầu, cổ vai gáy ngắn và sấy khô tạo phồng nhẹ.', 45, 280000.00, 110000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('8cd5842c-d4e3-4978-bb68-ad571833ee46', 'cce51510-f47f-45a9-8d72-0a42e481aaca', 'Gói thảo mộc 60 phút', 'Thêm xông hơi đầu, ủ thảo mộc, bấm huyệt cổ vai gáy và chườm ấm.', 60, 390000.00, 160000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('98732374-3e2b-4958-912f-3b4b7247cd90', 'cce51510-f47f-45a9-8d72-0a42e481aaca', 'Gói chuyên sâu 75 phút', 'Chăm sóc da đầu kỹ hơn, massage vai gáy dài, dưỡng tóc và sấy hoàn thiện.', 75, 520000.00, 220000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('778c0db3-de86-4478-aebf-7c743e72c324', 'a80289b4-7fe3-46d3-a529-cda9aa279be5', 'Gói làm mịn 60 phút', 'Tẩy tế bào chết body, massage dầu dưỡng và ủ kem dưỡng sáng dịu nhẹ.', 60, 620000.00, 260000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('31d9c3f1-2213-4204-8c9a-42f932314c59', 'a80289b4-7fe3-46d3-a529-cda9aa279be5', 'Gói trắng sáng 90 phút', 'Thêm làm sạch body, ủ dưỡng lâu hơn và chăm sóc vùng khuỷu tay, đầu gối.', 90, 860000.00, 380000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('a2cbe9e3-7c50-4a16-8b25-0e5248900286', 'a80289b4-7fe3-46d3-a529-cda9aa279be5', 'Gói cao cấp 120 phút', 'Kết hợp tẩy da chết, massage thư giãn, ủ body chuyên sâu và dưỡng khóa ẩm toàn thân.', 120, 1180000.00, 520000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d66fc350-34b8-4c0e-8d91-6cce3092aa32', '80269ef7-9c19-47c0-b45c-d381e58e7c76', 'Gói một buổi vùng nách', 'Làm sạch vùng da, triệt bằng đầu lạnh, thoa gel làm dịu và hướng dẫn chăm sóc sau triệt.', 30, 250000.00, 90000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('168b037d-a493-43fd-916b-a794a796abbc', '30f47786-2f8c-4559-8121-8a02124d1e36', 'Gói sơn gel một màu', 'Cắt da, tạo form móng, sơn gel một màu và dưỡng dầu biểu bì.', 60, 320000.00, 120000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('4c27e4ae-e315-4c5c-a168-8e2dc4195fa5', 'e70b5b30-6a3b-4164-aef1-1e9ad8fe97cb', 'Gói cấp ẩm nhanh', 'Làm sạch, phun oxy tươi, serum cấp nước và mặt nạ làm dịu tức thì.', 45, 360000.00, 140000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('c50e3ab2-42ac-4e96-9329-dd4a7b24b8b6', '7c250a50-b132-4c6a-8ed7-972f8bca573c', 'Gói trị liệu lưng 75 phút', 'Massage vùng lưng với đá nóng, miết cơ cạnh sống lưng và chườm thư giãn cuối buổi.', 75, 650000.00, 270000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('5ec41a63-6736-4318-a881-80a833af05ad', 'ff80f24d-14fe-4c44-a93a-b5dbe07e8d83', 'Gói thảo mộc 90 phút', 'Tắm sạch, massage body, ủ thảo mộc thiên nhiên và dưỡng thể khóa ẩm.', 90, 790000.00, 330000.00, 0, 'ACTIVE', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `service_id` = VALUES(`service_id`),
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `duration` = VALUES(`duration`),
  `price` = VALUES(`price`),
  `cost_price` = VALUES(`cost_price`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`),
  `updated_at` = NOW();

-- Variants: Store 2. Five services have 3 variants, remaining services have 1 variant.
INSERT INTO `service_variants` (`id`, `service_id`, `name`, `description`, `duration`, `price`, `cost_price`, `sort_order`, `status`, `created_at`, `updated_at`) VALUES
  ('f0f327f5-0bc0-4a0c-8030-3c0f95186e7a', '9379b193-46e7-4a62-879b-c7dfe254b525', 'Gói collagen cơ bản 70 phút', 'Làm sạch, massage nâng cơ nhẹ, điện di collagen và mặt nạ cấp ẩm.', 70, 620000.00, 260000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('95db7515-cfb4-48a0-bb66-12215b6416bf', '9379b193-46e7-4a62-879b-c7dfe254b525', 'Gói phục hồi 90 phút', 'Thêm tinh chất peptide, chăm sóc cổ và mặt nạ phục hồi chuyên sâu.', 90, 850000.00, 370000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('939e5427-4d51-47dc-8fc2-5e1292e1344f', '9379b193-46e7-4a62-879b-c7dfe254b525', 'Gói nâng cơ cao cấp 120 phút', 'Kết hợp massage nâng cơ dài, điện di collagen, mặt nạ chuyên biệt và chăm sóc vai gáy.', 120, 1250000.00, 560000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('a94f0ad3-8ada-4fc6-a072-76858ef5eccb', '820f7e87-eded-4f55-b06d-37e7027cf4fd', 'Gói peel dịu nhẹ 45 phút', 'Làm sạch, peel sinh học nồng độ thấp, trung hòa và phục hồi ẩm.', 45, 520000.00, 210000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('a783e111-cac8-43e7-a090-200c1c4d3fd6', '820f7e87-eded-4f55-b06d-37e7027cf4fd', 'Gói peel tái tạo 60 phút', 'Peel theo nền da, làm dịu bằng serum phục hồi và mặt nạ giảm đỏ.', 60, 720000.00, 310000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('216ef60d-4da2-49cf-be0e-166941ef7576', '820f7e87-eded-4f55-b06d-37e7027cf4fd', 'Gói peel chuyên sâu 75 phút', 'Tư vấn nền da, peel nhiều bước, chiếu ánh sáng làm dịu và hướng dẫn chăm sóc sau peel.', 75, 960000.00, 430000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('be446329-a7ef-41c1-a04d-2aa4a8c791fd', '86119eff-efaf-4e0f-9393-346494e72b27', 'Gói mẹ thư giãn 60 phút', 'Massage tư thế nghiêng an toàn, tập trung lưng, vai và chân với dầu nền dịu mùi.', 60, 560000.00, 230000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('920f541e-70b6-4269-9900-0220d84ed629', '86119eff-efaf-4e0f-9393-346494e72b27', 'Gói mẹ nhẹ người 90 phút', 'Thêm ngâm chân ấm, chăm sóc bàn chân và chườm ấm vùng vai gáy.', 90, 820000.00, 350000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('7c87e748-60f7-45c0-bab5-6c589e1c99c5', '86119eff-efaf-4e0f-9393-346494e72b27', 'Gói mẹ ngủ ngon 120 phút', 'Massage toàn thân nhịp chậm, dưỡng chân, chăm sóc da đầu và thư giãn cuối buổi.', 120, 1080000.00, 480000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('e669bc41-2a8c-4f3b-8f74-53b3b069d824', '03744b2b-6616-401f-9d56-43f3dd8fc95b', 'Gói dưỡng sinh 50 phút', 'Gội thảo dược, massage đầu, cổ vai gáy và chườm thảo mộc nóng.', 50, 340000.00, 140000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('5e6a4f04-d04f-4601-aa40-df7e2aa736b0', '03744b2b-6616-401f-9d56-43f3dd8fc95b', 'Gói an thần 70 phút', 'Thêm bấm huyệt, massage vai gáy dài hơn và ủ tóc bằng dầu dưỡng.', 70, 480000.00, 200000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('2870ec64-b825-4274-a790-65c73e047084', '03744b2b-6616-401f-9d56-43f3dd8fc95b', 'Gói thảo dược chuyên sâu 90 phút', 'Kết hợp xông hơi đầu, chườm nóng, massage cổ vai gáy và chăm sóc tóc hoàn thiện.', 90, 650000.00, 280000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('e7bccbbc-7046-45f1-8af3-42ffd3f11d39', 'e626c717-a57b-48cb-a0b5-4f5f66271ef1', 'Gói RF vùng bụng 45 phút', 'Làm nóng RF vùng bụng, massage dẫn lưu và thoa gel săn chắc.', 45, 650000.00, 290000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('8105590f-6a5d-4848-8e04-c2619922f594', 'e626c717-a57b-48cb-a0b5-4f5f66271ef1', 'Gói RF bụng eo 70 phút', 'Tập trung bụng và eo, thêm quấn nóng nhẹ và massage tạo đường nét.', 70, 920000.00, 410000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('3a2a0bfc-be12-474f-af8e-10bdaf63df1f', 'e626c717-a57b-48cb-a0b5-4f5f66271ef1', 'Gói RF chuyên sâu 90 phút', 'RF nhiều vùng quanh bụng, dẫn lưu sâu, quấn gel săn chắc và đo số đo sau buổi.', 90, 1250000.00, 560000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('ea982238-1cd8-4947-bf4f-cf665b6d5c07', '7edec950-6d82-4b46-9a93-a56b80b99842', 'Gói nối mi tự nhiên', 'Tư vấn dáng mi, nối mi lụa sợi mảnh và chải định hình sau khi hoàn thiện.', 90, 520000.00, 210000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('ab564170-4ca2-4429-b8bd-ef8ccf717a8e', '14de4fe4-d681-40d6-82d9-c8125caa3c59', 'Gói wax tay hoặc chân', 'Làm sạch da, wax bằng sáp ấm, loại bỏ sáp thừa và thoa gel làm dịu.', 45, 360000.00, 130000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('c26d5b37-0e80-43cb-b313-00f710b6f31a', '477a1ffb-8b61-4e5d-bada-7534a3c1bb3a', 'Gói làm sạch da lưng', 'Xông hơi vùng lưng, tẩy tế bào chết, xử lý mụn phù hợp và đắp mặt nạ khoáng.', 75, 620000.00, 260000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('9ba6495c-4dda-43dc-a4e3-e2424bd24504', '5429a681-1e38-4aab-b1e7-57b6abcd5808', 'Gói chăm sóc chân mềm gót', 'Ngâm chân, vệ sinh móng, chăm sóc gót và sơn gel chân một màu.', 70, 420000.00, 160000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('9b6c4966-8258-4b0b-b239-2f201183f210', '386952be-68a5-4684-b50e-d1ce1177a3a9', 'Gói yến mạch làm dịu 75 phút', 'Tắm sạch, ủ body yến mạch, massage nhẹ và dưỡng thể phục hồi da khô.', 75, 690000.00, 280000.00, 0, 'ACTIVE', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `service_id` = VALUES(`service_id`),
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `duration` = VALUES(`duration`),
  `price` = VALUES(`price`),
  `cost_price` = VALUES(`cost_price`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`),
  `updated_at` = NOW();

-- Staff can perform every active service in their own store.
INSERT IGNORE INTO `staff_services` (`staff_id`, `service_id`)
SELECT `staff_seed`.`staff_id`, `svc`.`id`
FROM (
  SELECT @store1_staff1_id AS `staff_id`, @store1_id AS `store_id`
  UNION ALL SELECT @store1_staff2_id, @store1_id
  UNION ALL SELECT @store1_staff3_id, @store1_id
  UNION ALL SELECT @store2_staff1_id, @store2_id
  UNION ALL SELECT @store2_staff2_id, @store2_id
  UNION ALL SELECT @store2_staff3_id, @store2_id
) `staff_seed`
JOIN `services` `svc` ON `svc`.`shop_id` = `staff_seed`.`store_id`
WHERE `svc`.`status` = 'ACTIVE';

-- Weekly schedules for 3 staff in each store.
INSERT INTO `staff_schedules` (`id`, `shop_id`, `staff_id`, `day_of_week`, `start_time`, `end_time`, `is_active`) VALUES
  ('40897df4-f1fe-4cfa-a36e-32476cdeee3c', @store1_id, @store1_staff1_id, 'MONDAY', '09:00', '17:00', 1),
  ('b7352995-faa5-4785-a18a-0bc638c6328d', @store1_id, @store1_staff1_id, 'TUESDAY', '09:00', '17:00', 1),
  ('fda8e866-43f8-49b8-930f-c53aed79d7dc', @store1_id, @store1_staff1_id, 'WEDNESDAY', '09:00', '17:00', 1),
  ('61ab6fcd-135a-49e0-b720-6ed166726cbc', @store1_id, @store1_staff1_id, 'THURSDAY', '09:00', '17:00', 1),
  ('ff8a50da-7e4e-46bd-a977-9d96c010eda8', @store1_id, @store1_staff1_id, 'FRIDAY', '09:00', '17:00', 1),
  ('f5e7fd81-89c7-4140-8d0f-d8263af1a7ff', @store1_id, @store1_staff1_id, 'SATURDAY', '08:30', '16:30', 1),
  ('193fb1c9-64a5-4733-a6fe-3c44a7b6a234', @store1_id, @store1_staff1_id, 'SUNDAY', '09:00', '15:00', 1),
  ('31c0c405-879d-4d32-b7d7-ae066b426706', @store1_id, @store1_staff2_id, 'MONDAY', '12:00', '21:00', 1),
  ('06b573db-eeec-411a-a284-138c76138a80', @store1_id, @store1_staff2_id, 'TUESDAY', '12:00', '21:00', 1),
  ('b456bfa0-8d93-4312-a21b-fe35a8438e93', @store1_id, @store1_staff2_id, 'WEDNESDAY', '12:00', '21:00', 1),
  ('d5c284ad-e3ad-4b77-a471-a40afd4576be', @store1_id, @store1_staff2_id, 'THURSDAY', '12:00', '21:00', 1),
  ('44e29e37-c2ce-4ade-ba57-014385505db6', @store1_id, @store1_staff2_id, 'FRIDAY', '12:00', '21:00', 1),
  ('4740ce69-748f-4a49-8b49-aeb61bd1cba5', @store1_id, @store1_staff2_id, 'SATURDAY', '13:00', '21:30', 1),
  ('33d85fa3-ca8f-4994-b0ba-8036f3e55a23', @store1_id, @store1_staff2_id, 'SUNDAY', '10:00', '18:00', 1),
  ('9f0e16e8-fe85-4ed6-8077-5b0daa55f317', @store1_id, @store1_staff3_id, 'MONDAY', '10:00', '19:00', 1),
  ('207ce294-7721-4a8e-aafd-0fd6ced4d93b', @store1_id, @store1_staff3_id, 'TUESDAY', '10:00', '19:00', 1),
  ('56a9b476-a7d0-49f3-b0b3-0deffc610813', @store1_id, @store1_staff3_id, 'WEDNESDAY', '10:00', '19:00', 1),
  ('cf99ea17-24b5-4d0b-85b2-6069a1be63e4', @store1_id, @store1_staff3_id, 'THURSDAY', '10:00', '19:00', 1),
  ('168d8894-f06a-44a7-bd10-d72cc667e9c5', @store1_id, @store1_staff3_id, 'FRIDAY', '10:00', '19:00', 1),
  ('b89a497a-81dc-47c5-a3de-cd9cb8bb1d67', @store1_id, @store1_staff3_id, 'SATURDAY', '09:30', '18:30', 1),
  ('3b3fc93d-a80d-4ef2-8171-6aad9aa156f6', @store1_id, @store1_staff3_id, 'SUNDAY', '09:00', '18:00', 1),
  ('cfccb0fb-d0f5-4c5d-9e8f-0abdd8b60479', @store2_id, @store2_staff1_id, 'MONDAY', '09:00', '17:30', 1),
  ('ea2466b1-0dd9-458f-a3d5-7ed2c2d618f3', @store2_id, @store2_staff1_id, 'TUESDAY', '09:00', '17:30', 1),
  ('5a0ef6a7-ec70-462b-b21e-b5cf63d5b405', @store2_id, @store2_staff1_id, 'WEDNESDAY', '09:00', '17:30', 1),
  ('5bb7f09d-3a65-49ea-ab7e-ff25a087fd02', @store2_id, @store2_staff1_id, 'THURSDAY', '09:00', '17:30', 1),
  ('1c2fb689-fc11-46c6-a385-51ff72049f72', @store2_id, @store2_staff1_id, 'FRIDAY', '09:00', '17:30', 1),
  ('7408fc97-8f2c-4439-8eca-5805d6a01799', @store2_id, @store2_staff1_id, 'SATURDAY', '08:30', '16:30', 1),
  ('ed7950b1-dfdd-4a4a-958e-3fcb48a6f16d', @store2_id, @store2_staff1_id, 'SUNDAY', '09:00', '15:00', 1),
  ('9e787e32-0a93-4325-a8db-9fd158df71a1', @store2_id, @store2_staff2_id, 'MONDAY', '11:30', '20:30', 1),
  ('257ed186-17d6-4acf-b014-e66c1743dc2a', @store2_id, @store2_staff2_id, 'TUESDAY', '11:30', '20:30', 1),
  ('198020b7-9492-41b5-9047-06ff0fff888f', @store2_id, @store2_staff2_id, 'WEDNESDAY', '11:30', '20:30', 1),
  ('76ed60aa-acd0-4f8b-9403-2255eb8eb621', @store2_id, @store2_staff2_id, 'THURSDAY', '11:30', '20:30', 1),
  ('e826d189-a2f0-4e24-9566-bc31ce1dbf44', @store2_id, @store2_staff2_id, 'FRIDAY', '11:30', '20:30', 1),
  ('a788c9b5-c326-4cff-9ee1-ce7129ba9d3c', @store2_id, @store2_staff2_id, 'SATURDAY', '12:00', '21:00', 1),
  ('489441e8-bb4d-42d8-8db5-87ffa07898c8', @store2_id, @store2_staff2_id, 'SUNDAY', '09:30', '17:30', 1),
  ('fc1a41a1-6f24-4911-bfbe-d39a40507ff4', @store2_id, @store2_staff3_id, 'MONDAY', '10:00', '19:00', 1),
  ('9dd471c4-f0cb-4d4e-b15e-89b01ad8107d', @store2_id, @store2_staff3_id, 'TUESDAY', '10:00', '19:00', 1),
  ('3e0164ef-6586-46f5-be90-194a46a93500', @store2_id, @store2_staff3_id, 'WEDNESDAY', '10:00', '19:00', 1),
  ('dbfcbbe6-ea5a-430a-b503-4a1740bb6c17', @store2_id, @store2_staff3_id, 'THURSDAY', '10:00', '19:00', 1),
  ('0a93d007-b0ba-4ffb-a77d-7b64608de215', @store2_id, @store2_staff3_id, 'FRIDAY', '10:00', '19:00', 1),
  ('e15f5ada-035e-470e-8260-8020c7b0b099', @store2_id, @store2_staff3_id, 'SATURDAY', '09:30', '18:30', 1),
  ('e79dfe34-d4bc-4204-bcfc-dcd7d2d0c6a5', @store2_id, @store2_staff3_id, 'SUNDAY', '09:00', '17:00', 1)
ON DUPLICATE KEY UPDATE
  `shop_id` = VALUES(`shop_id`),
  `start_time` = VALUES(`start_time`),
  `end_time` = VALUES(`end_time`),
  `is_active` = VALUES(`is_active`);

-- Store demo descriptions as HTML strings for frontend rich-text rendering.
UPDATE `service_categories`
SET `description` = CASE
  WHEN `description` IS NULL OR TRIM(`description`) = '' THEN `description`
  WHEN TRIM(`description`) LIKE '<%' THEN `description`
  ELSE CONCAT('<p>', `description`, '</p>')
END
WHERE `slug` IN (
  'cham-soc-da-mat',
  'massage-va-tri-lieu',
  'cham-soc-co-the',
  'nail-va-mi',
  'triet-long-va-waxing',
  'duong-sinh'
);

UPDATE `stores`
SET `description` = CASE
  WHEN `description` IS NULL OR TRIM(`description`) = '' THEN `description`
  WHEN TRIM(`description`) LIKE '<%' THEN `description`
  ELSE CONCAT('<p>', `description`, '</p>')
END
WHERE `slug` IN (
  'lumina-skin-spa-ho-chi-minh',
  'an-nhien-beauty-lounge-ha-noi'
);

UPDATE `services`
SET `description` = CASE
  WHEN `description` IS NULL OR TRIM(`description`) = '' THEN `description`
  WHEN TRIM(`description`) LIKE '<%' THEN `description`
  ELSE CONCAT('<p>', `description`, '</p>')
END
WHERE `slug` IN (
  'cham-soc-da-mat-sach-sau-cap-am-phuc-hoi',
  'dieu-tri-mun-chuyen-sau-giam-viem',
  'massage-thu-gian-toan-than-huong-tinh-dau',
  'goi-dau-duong-sinh-co-vai-gay',
  'tay-te-bao-chet-u-duong-trang-sang-body',
  'triet-long-nach-cong-nghe-lanh',
  'cham-soc-mong-tay-gel-mau-co-ban',
  'phun-oxy-tuoi-cap-am-tuc-thi',
  'massage-da-nong-tri-lieu-vung-lung',
  'tam-trang-thao-moc-thien-nhien',
  'cham-soc-da-mat-chong-lao-hoa-collagen',
  'peel-da-sinh-hoc-tai-tao-be-mat',
  'massage-bau-thu-gian-an-toan-cho-me',
  'duong-sinh-dau-vai-gay-bang-thao-duoc-nong',
  'lieu-trinh-giam-beo-bung-cong-nghe-rf',
  'noi-mi-lua-tu-nhien-phong-cach-han-quoc',
  'wax-long-tay-chan-bang-sap-am-diu-nhe',
  'cham-soc-da-lung-lam-sach-mun',
  'son-gel-chan-cham-soc-got-mem',
  'tam-u-body-yen-mach-lam-diu-da'
);

UPDATE `service_variants`
SET `description` = CASE
  WHEN `description` IS NULL OR TRIM(`description`) = '' THEN `description`
  WHEN TRIM(`description`) LIKE '<%' THEN `description`
  ELSE CONCAT('<p>', `description`, '</p>')
END
WHERE `service_id` IN (
  SELECT `id`
  FROM `services`
  WHERE `slug` IN (
    'cham-soc-da-mat-sach-sau-cap-am-phuc-hoi',
    'dieu-tri-mun-chuyen-sau-giam-viem',
    'massage-thu-gian-toan-than-huong-tinh-dau',
    'goi-dau-duong-sinh-co-vai-gay',
    'tay-te-bao-chet-u-duong-trang-sang-body',
    'triet-long-nach-cong-nghe-lanh',
    'cham-soc-mong-tay-gel-mau-co-ban',
    'phun-oxy-tuoi-cap-am-tuc-thi',
    'massage-da-nong-tri-lieu-vung-lung',
    'tam-trang-thao-moc-thien-nhien',
    'cham-soc-da-mat-chong-lao-hoa-collagen',
    'peel-da-sinh-hoc-tai-tao-be-mat',
    'massage-bau-thu-gian-an-toan-cho-me',
    'duong-sinh-dau-vai-gay-bang-thao-duoc-nong',
    'lieu-trinh-giam-beo-bung-cong-nghe-rf',
    'noi-mi-lua-tu-nhien-phong-cach-han-quoc',
    'wax-long-tay-chan-bang-sap-am-diu-nhe',
    'cham-soc-da-lung-lam-sach-mun',
    'son-gel-chan-cham-soc-got-mem',
    'tam-u-body-yen-mach-lam-diu-da'
  )
);

COMMIT;
