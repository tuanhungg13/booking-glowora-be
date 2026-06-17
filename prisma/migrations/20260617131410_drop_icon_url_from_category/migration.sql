-- Migrate existing icon_url data to banner_url where banner_url is not yet set
UPDATE `service_categories`
SET `banner_url` = `icon_url`
WHERE `icon_url` IS NOT NULL AND `banner_url` IS NULL;

-- AlterTable: drop icon_url column
ALTER TABLE `service_categories` DROP COLUMN `icon_url`;
