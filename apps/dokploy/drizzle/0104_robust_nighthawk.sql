ALTER TABLE "volume_backup" ALTER COLUMN "volumeName" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "volume_backup" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "volume_backup" DROP COLUMN "hostPath";--> statement-breakpoint
DROP TYPE "public"."volumeBackupType";