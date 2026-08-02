-- AlterTable
ALTER TABLE `countermeasure_categories` ADD COLUMN `scope` ENUM('general', 'executive') NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE `issue_categories` ADD COLUMN `scope` ENUM('general', 'executive') NOT NULL DEFAULT 'general';
