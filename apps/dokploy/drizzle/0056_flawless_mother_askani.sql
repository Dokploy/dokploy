ALTER TABLE "server" ADD COLUMN "metricsToken" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "metricsUrlCallback" text DEFAULT '' NOT NULL;