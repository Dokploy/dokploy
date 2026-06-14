ALTER TYPE "public"."notificationType" ADD VALUE 'pagerduty';--> statement-breakpoint
ALTER TYPE "public"."notificationType" ADD VALUE 'opsgenie';--> statement-breakpoint
ALTER TYPE "public"."notificationType" ADD VALUE 'matrix';--> statement-breakpoint
CREATE TABLE "matrix" (
	"matrixId" text PRIMARY KEY NOT NULL,
	"homeServerUrl" text NOT NULL,
	"accessToken" text NOT NULL,
	"roomId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opsgenie" (
	"opsgenieId" text PRIMARY KEY NOT NULL,
	"apiKey" text NOT NULL,
	"region" text DEFAULT 'US' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagerduty" (
	"pagerdutyId" text PRIMARY KEY NOT NULL,
	"routingKey" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "pagerdutyId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "opsgenieId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "matrixId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_pagerdutyId_pagerduty_pagerdutyId_fk" FOREIGN KEY ("pagerdutyId") REFERENCES "public"."pagerduty"("pagerdutyId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_opsgenieId_opsgenie_opsgenieId_fk" FOREIGN KEY ("opsgenieId") REFERENCES "public"."opsgenie"("opsgenieId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_matrixId_matrix_matrixId_fk" FOREIGN KEY ("matrixId") REFERENCES "public"."matrix"("matrixId") ON DELETE cascade ON UPDATE no action;