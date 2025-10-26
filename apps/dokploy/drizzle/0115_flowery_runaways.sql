ALTER TABLE "domain" ADD COLUMN "isValidated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "validatedAt" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "validationError" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "resolvedIp" text;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "cdnProvider" text;