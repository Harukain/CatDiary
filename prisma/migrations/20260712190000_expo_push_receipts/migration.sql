ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';

ALTER TABLE "notification_logs"
ADD COLUMN "receipt_checked_at" TIMESTAMPTZ(3);
