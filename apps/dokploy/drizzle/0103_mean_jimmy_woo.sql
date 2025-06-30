ALTER TABLE "volume_backup" ADD COLUMN "turnOff" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "backup" DROP COLUMN "turnOff";