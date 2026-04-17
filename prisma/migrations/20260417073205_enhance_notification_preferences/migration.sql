-- AlterTable
ALTER TABLE "NotificationPreferences" ADD COLUMN     "digestDay" INTEGER,
ADD COLUMN     "digestFrequency" TEXT NOT NULL DEFAULT 'daily',
ADD COLUMN     "digestTime" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "emailDigest" TEXT NOT NULL DEFAULT 'daily',
ADD COLUMN     "eventRecommendations" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "eventUpdates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxNotificationsPerDay" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "notifyBeforeEvent" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "paymentConfirmations" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quietHoursEnd" TEXT,
ADD COLUMN     "quietHoursStart" TEXT,
ADD COLUMN     "quietHoursTimezone" TEXT NOT NULL DEFAULT 'Africa/Blantyre';
