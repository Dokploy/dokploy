CREATE TABLE "traefik_update_delivery" (
	"notificationId" text NOT NULL,
	"serverKey" text NOT NULL,
	"recommendedVersion" text NOT NULL,
	"claimToken" text NOT NULL,
	"claimedUntil" timestamp with time zone NOT NULL,
	"deliveredAt" timestamp with time zone,
	CONSTRAINT "traefik_update_delivery_pk" PRIMARY KEY("notificationId","serverKey","recommendedVersion")
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "traefikUpdateAvailable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "traefik_update_delivery" ADD CONSTRAINT "traefik_update_delivery_notification_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."notification"("notificationId") ON DELETE cascade ON UPDATE no action;