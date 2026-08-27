ALTER TABLE "server" ADD COLUMN "internalIpAddress" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "ipv6Address" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "useInternalIp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "serverIpv6" text;