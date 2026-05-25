-- ============================================================
-- DEMO SEED: 2 stores, 20 Vietnamese services, detailed variants
-- Target: MySQL/MariaDB schema generated from prisma/schema.prisma
-- Safe to re-run: fixed UUIDs + ON DUPLICATE KEY UPDATE
-- ============================================================

SET NAMES utf8mb4;
START TRANSACTION;

SET @demo_password_hash = '$2b$10$4rNY01kLNBZFcBWQuq.Rsu5P9g490SvP0fZ6PoftwySYtMQTKw/Dq'; -- Owner@123456

SET @owner1_seed_id = 'd2000000-0000-0000-0000-000000000001';
SET @owner2_seed_id = 'd2000000-0000-0000-0000-000000000002';
SET @store1_id = 'd1000000-0000-0000-0000-000000000001';
SET @store2_id = 'd1000000-0000-0000-0000-000000000002';
SET @store1_owner_role_id = 'd3000000-0000-0000-0000-000000000001';
SET @store2_owner_role_id = 'd3000000-0000-0000-0000-000000000002';

SET @cat_facial = 'c1000000-0000-0000-0000-000000000001';
SET @cat_massage = 'c1000000-0000-0000-0000-000000000002';
SET @cat_body = 'c1000000-0000-0000-0000-000000000003';
SET @cat_nail_lash = 'c1000000-0000-0000-0000-000000000004';
SET @cat_waxing = 'c1000000-0000-0000-0000-000000000005';
SET @cat_wellness = 'c1000000-0000-0000-0000-000000000006';

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
  ('d4000000-0000-0000-0001-000000000001', @store1_id, 'MONDAY', '09:00', '21:00', 0),
  ('d4000000-0000-0000-0001-000000000002', @store1_id, 'TUESDAY', '09:00', '21:00', 0),
  ('d4000000-0000-0000-0001-000000000003', @store1_id, 'WEDNESDAY', '09:00', '21:00', 0),
  ('d4000000-0000-0000-0001-000000000004', @store1_id, 'THURSDAY', '09:00', '21:00', 0),
  ('d4000000-0000-0000-0001-000000000005', @store1_id, 'FRIDAY', '09:00', '21:00', 0),
  ('d4000000-0000-0000-0001-000000000006', @store1_id, 'SATURDAY', '08:30', '21:30', 0),
  ('d4000000-0000-0000-0001-000000000007', @store1_id, 'SUNDAY', '09:00', '18:00', 0),
  ('d4000000-0000-0000-0002-000000000001', @store2_id, 'MONDAY', '09:00', '20:30', 0),
  ('d4000000-0000-0000-0002-000000000002', @store2_id, 'TUESDAY', '09:00', '20:30', 0),
  ('d4000000-0000-0000-0002-000000000003', @store2_id, 'WEDNESDAY', '09:00', '20:30', 0),
  ('d4000000-0000-0000-0002-000000000004', @store2_id, 'THURSDAY', '09:00', '20:30', 0),
  ('d4000000-0000-0000-0002-000000000005', @store2_id, 'FRIDAY', '09:00', '20:30', 0),
  ('d4000000-0000-0000-0002-000000000006', @store2_id, 'SATURDAY', '08:30', '21:00', 0),
  ('d4000000-0000-0000-0002-000000000007', @store2_id, 'SUNDAY', '09:00', '17:30', 0)
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
  ('d3100000-0000-0000-0000-000000000001', @owner1_id, @store1_owner_role_id, @store1_id, NOW()),
  ('d3100000-0000-0000-0000-000000000002', @owner2_id, @store2_owner_role_id, @store2_id, NOW())
ON DUPLICATE KEY UPDATE
  `user_id` = VALUES(`user_id`),
  `role_id` = VALUES(`role_id`),
  `shop_id` = VALUES(`shop_id`);

-- Services: Store 1 - Lumina Skin & Spa
INSERT INTO `services` (`id`, `shop_id`, `category_id`, `name`, `slug`, `description`, `image_url`, `status`, `avg_rating`, `created_at`, `updated_at`) VALUES
  ('d5000000-0000-0000-0001-000000000001', @store1_id, @cat_facial, 'Chăm sóc da mặt sạch sâu và cấp ẩm phục hồi', 'cham-soc-da-mat-sach-sau-cap-am-phuc-hoi', 'Làm sạch da nhiều bước, lấy bã nhờn nhẹ nhàng, cân bằng độ ẩm và phục hồi hàng rào bảo vệ da bằng mặt nạ cấp nước.', NULL, 'ACTIVE', 4.85, NOW(), NOW()),
  ('d5000000-0000-0000-0001-000000000002', @store1_id, @cat_facial, 'Điều trị mụn chuyên sâu giảm viêm', 'dieu-tri-mun-chuyen-sau-giam-viem', 'Liệu trình hỗ trợ da mụn gồm làm sạch, xông hơi, xử lý nhân mụn đúng kỹ thuật, điện di làm dịu và hướng dẫn chăm sóc tại nhà.', NULL, 'ACTIVE', 4.82, NOW(), NOW()),
  ('d5000000-0000-0000-0001-000000000003', @store1_id, @cat_massage, 'Massage thư giãn toàn thân hương tinh dầu', 'massage-thu-gian-toan-than-huong-tinh-dau', 'Massage toàn thân với lực vừa phải, kết hợp tinh dầu thiên nhiên giúp giảm căng cơ, thư giãn thần kinh và cải thiện chất lượng giấc ngủ.', NULL, 'ACTIVE', 4.90, NOW(), NOW()),
  ('d5000000-0000-0000-0001-000000000004', @store1_id, @cat_wellness, 'Gội đầu dưỡng sinh cổ vai gáy', 'goi-dau-duong-sinh-co-vai-gay', 'Gội đầu thảo mộc kết hợp massage da đầu, bấm huyệt cổ vai gáy và chườm ấm giúp thư giãn sau thời gian làm việc dài.', NULL, 'ACTIVE', 4.78, NOW(), NOW()),
  ('d5000000-0000-0000-0001-000000000005', @store1_id, @cat_body, 'Tẩy tế bào chết và ủ dưỡng trắng sáng body', 'tay-te-bao-chet-u-duong-trang-sang-body', 'Làm sạch lớp sừng già, massage body và ủ dưỡng bằng hoạt chất làm sáng dịu nhẹ để da mịn và đều màu hơn.', NULL, 'ACTIVE', 4.74, NOW(), NOW()),
  ('d5000000-0000-0000-0001-000000000006', @store1_id, @cat_waxing, 'Triệt lông nách công nghệ lạnh', 'triet-long-nach-cong-nghe-lanh', 'Triệt lông vùng nách bằng đầu lạnh hỗ trợ giảm cảm giác nóng rát, phù hợp liệu trình duy trì định kỳ.', NULL, 'ACTIVE', 4.70, NOW(), NOW()),
  ('d5000000-0000-0000-0001-000000000007', @store1_id, @cat_nail_lash, 'Chăm sóc móng tay gel màu cơ bản', 'cham-soc-mong-tay-gel-mau-co-ban', 'Cắt da, tạo dáng móng, dưỡng biểu bì và sơn gel một màu với lớp phủ bóng bền màu.', NULL, 'ACTIVE', 4.66, NOW(), NOW()),
  ('d5000000-0000-0000-0001-000000000008', @store1_id, @cat_facial, 'Phun oxy tươi cấp ẩm tức thì', 'phun-oxy-tuoi-cap-am-tuc-thi', 'Cấp ẩm nhanh bằng oxy tươi và serum dịu nhẹ, phù hợp da thiếu nước, xỉn màu hoặc cần làm dịu trước sự kiện.', NULL, 'ACTIVE', 4.72, NOW(), NOW()),
  ('d5000000-0000-0000-0001-000000000009', @store1_id, @cat_massage, 'Massage đá nóng trị liệu vùng lưng', 'massage-da-nong-tri-lieu-vung-lung', 'Tập trung vùng lưng, vai và thắt lưng với đá nóng, dầu nền và động tác miết sâu nhằm giảm mỏi cơ.', NULL, 'ACTIVE', 4.81, NOW(), NOW()),
  ('d5000000-0000-0000-0001-000000000010', @store1_id, @cat_body, 'Tắm trắng thảo mộc thiên nhiên', 'tam-trang-thao-moc-thien-nhien', 'Làm sạch, massage và ủ body bằng hỗn hợp thảo mộc thiên nhiên, giúp da mềm và sáng khỏe dần theo liệu trình.', NULL, 'ACTIVE', 4.69, NOW(), NOW())
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
  ('d5000000-0000-0000-0002-000000000001', @store2_id, @cat_facial, 'Chăm sóc da mặt chống lão hóa collagen', 'cham-soc-da-mat-chong-lao-hoa-collagen', 'Liệu trình làm sạch, massage nâng cơ nhẹ, điện di collagen và mặt nạ phục hồi nhằm cải thiện độ căng mịn cho da trưởng thành.', NULL, 'ACTIVE', 4.86, NOW(), NOW()),
  ('d5000000-0000-0000-0002-000000000002', @store2_id, @cat_facial, 'Peel da sinh học tái tạo bề mặt', 'peel-da-sinh-hoc-tai-tao-be-mat', 'Peel sinh học nồng độ phù hợp từng nền da, hỗ trợ làm mịn bề mặt, giảm bít tắc và cải thiện sắc tố không đều.', NULL, 'ACTIVE', 4.79, NOW(), NOW()),
  ('d5000000-0000-0000-0002-000000000003', @store2_id, @cat_massage, 'Massage bầu thư giãn an toàn cho mẹ', 'massage-bau-thu-gian-an-toan-cho-me', 'Massage chuyên biệt cho mẹ bầu với tư thế hỗ trợ, lực nhẹ và dầu nền dịu mùi giúp giảm mỏi lưng, chân và vai gáy.', NULL, 'ACTIVE', 4.88, NOW(), NOW()),
  ('d5000000-0000-0000-0002-000000000004', @store2_id, @cat_wellness, 'Dưỡng sinh đầu vai gáy bằng thảo dược nóng', 'duong-sinh-dau-vai-gay-bang-thao-duoc-nong', 'Chăm sóc đầu cổ vai gáy bằng dầu thảo dược, chườm nóng và kỹ thuật day ấn huyệt giúp cơ thể thư giãn sâu.', NULL, 'ACTIVE', 4.83, NOW(), NOW()),
  ('d5000000-0000-0000-0002-000000000005', @store2_id, @cat_body, 'Liệu trình giảm béo bụng công nghệ RF', 'lieu-trinh-giam-beo-bung-cong-nghe-rf', 'Kết hợp làm nóng RF, massage dẫn lưu và gel săn chắc nhằm hỗ trợ giảm số đo vùng bụng theo liệu trình.', NULL, 'ACTIVE', 4.71, NOW(), NOW()),
  ('d5000000-0000-0000-0002-000000000006', @store2_id, @cat_nail_lash, 'Nối mi lụa tự nhiên phong cách Hàn Quốc', 'noi-mi-lua-tu-nhien-phong-cach-han-quoc', 'Nối mi sợi mảnh, dáng tự nhiên, cân chỉnh theo khuôn mắt để tạo hiệu ứng mềm và nhẹ.', NULL, 'ACTIVE', 4.76, NOW(), NOW()),
  ('d5000000-0000-0000-0002-000000000007', @store2_id, @cat_waxing, 'Wax lông tay chân bằng sáp ấm dịu nhẹ', 'wax-long-tay-chan-bang-sap-am-diu-nhe', 'Wax lông tay hoặc chân bằng sáp ấm, làm sạch da trước và sau dịch vụ, thoa gel làm dịu để giảm kích ứng.', NULL, 'ACTIVE', 4.64, NOW(), NOW()),
  ('d5000000-0000-0000-0002-000000000008', @store2_id, @cat_facial, 'Chăm sóc da lưng làm sạch mụn', 'cham-soc-da-lung-lam-sach-mun', 'Làm sạch da lưng, tẩy tế bào chết, xử lý mụn phù hợp và đắp mặt nạ khoáng giúp vùng lưng thông thoáng hơn.', NULL, 'ACTIVE', 4.73, NOW(), NOW()),
  ('d5000000-0000-0000-0002-000000000009', @store2_id, @cat_nail_lash, 'Sơn gel chân và chăm sóc gót mềm', 'son-gel-chan-cham-soc-got-mem', 'Ngâm chân, làm sạch móng, xử lý da khô vùng gót và sơn gel chân một màu hoặc nhũ nhẹ.', NULL, 'ACTIVE', 4.67, NOW(), NOW()),
  ('d5000000-0000-0000-0002-000000000010', @store2_id, @cat_body, 'Tắm ủ body yến mạch làm dịu da', 'tam-u-body-yen-mach-lam-diu-da', 'Tắm ủ body với yến mạch và sữa dưỡng dịu nhẹ, phù hợp da khô, da dễ kích ứng hoặc cần phục hồi sau nắng.', NULL, 'ACTIVE', 4.68, NOW(), NOW())
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
  ('d6000000-0000-0000-0001-000000000001', 'd5000000-0000-0000-0001-000000000001', 'Gói tiêu chuẩn 60 phút', 'Làm sạch, tẩy tế bào chết nhẹ, hút bã nhờn vùng chữ T, mặt nạ cấp ẩm và kem khóa ẩm.', 60, 420000.00, 180000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000002', 'd5000000-0000-0000-0001-000000000001', 'Gói chuyên sâu 75 phút', 'Thêm xông hơi, lấy nhân mụn nhẹ, điện di serum HA và massage nâng cơ mặt.', 75, 590000.00, 250000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000003', 'd5000000-0000-0000-0001-000000000001', 'Gói cao cấp 90 phút', 'Bổ sung tinh chất phục hồi, mặt nạ chuyên biệt theo nền da và chăm sóc cổ vai gáy ngắn.', 90, 780000.00, 330000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000004', 'd5000000-0000-0000-0001-000000000002', 'Gói nền tảng 75 phút', 'Làm sạch sâu, xông hơi, xử lý nhân mụn chọn lọc, sát khuẩn và mặt nạ làm dịu.', 75, 560000.00, 230000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000005', 'd5000000-0000-0000-0001-000000000002', 'Gói chuyên sâu 90 phút', 'Thêm chiếu ánh sáng xanh, điện di phục hồi và serum giảm viêm cho da mụn nhạy cảm.', 90, 720000.00, 310000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000006', 'd5000000-0000-0000-0001-000000000002', 'Gói theo phác đồ 120 phút', 'Đánh giá da, xử lý mụn kỹ hơn, làm dịu nhiều bước và tư vấn lịch chăm sóc trong 4 tuần.', 120, 980000.00, 430000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000007', 'd5000000-0000-0000-0001-000000000003', 'Gói thư giãn 60 phút', 'Massage toàn thân lực nhẹ đến vừa với tinh dầu lavender, tập trung lưng, chân và vai.', 60, 520000.00, 210000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000008', 'd5000000-0000-0000-0001-000000000003', 'Gói cân bằng 90 phút', 'Massage toàn thân đầy đủ, thêm chườm ấm vùng lưng và kéo giãn nhẹ cuối buổi.', 90, 760000.00, 320000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000009', 'd5000000-0000-0000-0001-000000000003', 'Gói ngủ ngon 120 phút', 'Massage sâu hơn, chăm sóc bàn chân, da đầu và tinh dầu ấm giúp cơ thể thả lỏng lâu hơn.', 120, 980000.00, 430000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000010', 'd5000000-0000-0000-0001-000000000004', 'Gói cơ bản 45 phút', 'Gội thảo mộc, massage da đầu, cổ vai gáy ngắn và sấy khô tạo phồng nhẹ.', 45, 280000.00, 110000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000011', 'd5000000-0000-0000-0001-000000000004', 'Gói thảo mộc 60 phút', 'Thêm xông hơi đầu, ủ thảo mộc, bấm huyệt cổ vai gáy và chườm ấm.', 60, 390000.00, 160000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000012', 'd5000000-0000-0000-0001-000000000004', 'Gói chuyên sâu 75 phút', 'Chăm sóc da đầu kỹ hơn, massage vai gáy dài, dưỡng tóc và sấy hoàn thiện.', 75, 520000.00, 220000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000013', 'd5000000-0000-0000-0001-000000000005', 'Gói làm mịn 60 phút', 'Tẩy tế bào chết body, massage dầu dưỡng và ủ kem dưỡng sáng dịu nhẹ.', 60, 620000.00, 260000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000014', 'd5000000-0000-0000-0001-000000000005', 'Gói trắng sáng 90 phút', 'Thêm làm sạch body, ủ dưỡng lâu hơn và chăm sóc vùng khuỷu tay, đầu gối.', 90, 860000.00, 380000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000015', 'd5000000-0000-0000-0001-000000000005', 'Gói cao cấp 120 phút', 'Kết hợp tẩy da chết, massage thư giãn, ủ body chuyên sâu và dưỡng khóa ẩm toàn thân.', 120, 1180000.00, 520000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000016', 'd5000000-0000-0000-0001-000000000006', 'Gói một buổi vùng nách', 'Làm sạch vùng da, triệt bằng đầu lạnh, thoa gel làm dịu và hướng dẫn chăm sóc sau triệt.', 30, 250000.00, 90000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000017', 'd5000000-0000-0000-0001-000000000007', 'Gói sơn gel một màu', 'Cắt da, tạo form móng, sơn gel một màu và dưỡng dầu biểu bì.', 60, 320000.00, 120000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000018', 'd5000000-0000-0000-0001-000000000008', 'Gói cấp ẩm nhanh', 'Làm sạch, phun oxy tươi, serum cấp nước và mặt nạ làm dịu tức thì.', 45, 360000.00, 140000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000019', 'd5000000-0000-0000-0001-000000000009', 'Gói trị liệu lưng 75 phút', 'Massage vùng lưng với đá nóng, miết cơ cạnh sống lưng và chườm thư giãn cuối buổi.', 75, 650000.00, 270000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0001-000000000020', 'd5000000-0000-0000-0001-000000000010', 'Gói thảo mộc 90 phút', 'Tắm sạch, massage body, ủ thảo mộc thiên nhiên và dưỡng thể khóa ẩm.', 90, 790000.00, 330000.00, 0, 'ACTIVE', NOW(), NOW())
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
  ('d6000000-0000-0000-0002-000000000001', 'd5000000-0000-0000-0002-000000000001', 'Gói collagen cơ bản 70 phút', 'Làm sạch, massage nâng cơ nhẹ, điện di collagen và mặt nạ cấp ẩm.', 70, 620000.00, 260000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000002', 'd5000000-0000-0000-0002-000000000001', 'Gói phục hồi 90 phút', 'Thêm tinh chất peptide, chăm sóc cổ và mặt nạ phục hồi chuyên sâu.', 90, 850000.00, 370000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000003', 'd5000000-0000-0000-0002-000000000001', 'Gói nâng cơ cao cấp 120 phút', 'Kết hợp massage nâng cơ dài, điện di collagen, mặt nạ chuyên biệt và chăm sóc vai gáy.', 120, 1250000.00, 560000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000004', 'd5000000-0000-0000-0002-000000000002', 'Gói peel dịu nhẹ 45 phút', 'Làm sạch, peel sinh học nồng độ thấp, trung hòa và phục hồi ẩm.', 45, 520000.00, 210000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000005', 'd5000000-0000-0000-0002-000000000002', 'Gói peel tái tạo 60 phút', 'Peel theo nền da, làm dịu bằng serum phục hồi và mặt nạ giảm đỏ.', 60, 720000.00, 310000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000006', 'd5000000-0000-0000-0002-000000000002', 'Gói peel chuyên sâu 75 phút', 'Tư vấn nền da, peel nhiều bước, chiếu ánh sáng làm dịu và hướng dẫn chăm sóc sau peel.', 75, 960000.00, 430000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000007', 'd5000000-0000-0000-0002-000000000003', 'Gói mẹ thư giãn 60 phút', 'Massage tư thế nghiêng an toàn, tập trung lưng, vai và chân với dầu nền dịu mùi.', 60, 560000.00, 230000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000008', 'd5000000-0000-0000-0002-000000000003', 'Gói mẹ nhẹ người 90 phút', 'Thêm ngâm chân ấm, chăm sóc bàn chân và chườm ấm vùng vai gáy.', 90, 820000.00, 350000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000009', 'd5000000-0000-0000-0002-000000000003', 'Gói mẹ ngủ ngon 120 phút', 'Massage toàn thân nhịp chậm, dưỡng chân, chăm sóc da đầu và thư giãn cuối buổi.', 120, 1080000.00, 480000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000010', 'd5000000-0000-0000-0002-000000000004', 'Gói dưỡng sinh 50 phút', 'Gội thảo dược, massage đầu, cổ vai gáy và chườm thảo mộc nóng.', 50, 340000.00, 140000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000011', 'd5000000-0000-0000-0002-000000000004', 'Gói an thần 70 phút', 'Thêm bấm huyệt, massage vai gáy dài hơn và ủ tóc bằng dầu dưỡng.', 70, 480000.00, 200000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000012', 'd5000000-0000-0000-0002-000000000004', 'Gói thảo dược chuyên sâu 90 phút', 'Kết hợp xông hơi đầu, chườm nóng, massage cổ vai gáy và chăm sóc tóc hoàn thiện.', 90, 650000.00, 280000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000013', 'd5000000-0000-0000-0002-000000000005', 'Gói RF vùng bụng 45 phút', 'Làm nóng RF vùng bụng, massage dẫn lưu và thoa gel săn chắc.', 45, 650000.00, 290000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000014', 'd5000000-0000-0000-0002-000000000005', 'Gói RF bụng eo 70 phút', 'Tập trung bụng và eo, thêm quấn nóng nhẹ và massage tạo đường nét.', 70, 920000.00, 410000.00, 1, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000015', 'd5000000-0000-0000-0002-000000000005', 'Gói RF chuyên sâu 90 phút', 'RF nhiều vùng quanh bụng, dẫn lưu sâu, quấn gel săn chắc và đo số đo sau buổi.', 90, 1250000.00, 560000.00, 2, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000016', 'd5000000-0000-0000-0002-000000000006', 'Gói nối mi tự nhiên', 'Tư vấn dáng mi, nối mi lụa sợi mảnh và chải định hình sau khi hoàn thiện.', 90, 520000.00, 210000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000017', 'd5000000-0000-0000-0002-000000000007', 'Gói wax tay hoặc chân', 'Làm sạch da, wax bằng sáp ấm, loại bỏ sáp thừa và thoa gel làm dịu.', 45, 360000.00, 130000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000018', 'd5000000-0000-0000-0002-000000000008', 'Gói làm sạch da lưng', 'Xông hơi vùng lưng, tẩy tế bào chết, xử lý mụn phù hợp và đắp mặt nạ khoáng.', 75, 620000.00, 260000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000019', 'd5000000-0000-0000-0002-000000000009', 'Gói chăm sóc chân mềm gót', 'Ngâm chân, vệ sinh móng, chăm sóc gót và sơn gel chân một màu.', 70, 420000.00, 160000.00, 0, 'ACTIVE', NOW(), NOW()),
  ('d6000000-0000-0000-0002-000000000020', 'd5000000-0000-0000-0002-000000000010', 'Gói yến mạch làm dịu 75 phút', 'Tắm sạch, ủ body yến mạch, massage nhẹ và dưỡng thể phục hồi da khô.', 75, 690000.00, 280000.00, 0, 'ACTIVE', NOW(), NOW())
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
