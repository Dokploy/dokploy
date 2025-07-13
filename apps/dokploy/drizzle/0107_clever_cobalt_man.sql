CREATE TABLE "web_server" (
	"webServerId" text PRIMARY KEY NOT NULL,
	"serverIp" text,
	"certificateType" "certificateType" DEFAULT 'none' NOT NULL,
	"https" boolean DEFAULT false NOT NULL,
	"host" text,
	"letsEncryptEmail" text,
	"sshPrivateKey" text,
	"enableDockerCleanup" boolean DEFAULT false NOT NULL,
	"logCleanupCron" text DEFAULT '0 0 * * *',
	"metricsConfig" jsonb DEFAULT '{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}'::jsonb NOT NULL
);

--> statement-breakpoint
-- Migrar datos del usuario owner único hacia web_server
INSERT INTO "web_server" (
	"webServerId", 
	"serverIp", 
	"certificateType", 
	"https", 
	"host", 
	"letsEncryptEmail", 
	"sshPrivateKey", 
	"enableDockerCleanup", 
	"logCleanupCron", 
	"metricsConfig"
)
SELECT 
	gen_random_uuid() as "webServerId",
	u."serverIp",
	COALESCE(u."certificateType", 'none') as "certificateType",
	COALESCE(u."https", false) as "https",
	u."host",
	u."letsEncryptEmail",
	u."sshPrivateKey",
	COALESCE(u."enableDockerCleanup", false) as "enableDockerCleanup",
	COALESCE(u."logCleanupCron", '0 0 * * *') as "logCleanupCron",
	COALESCE(u."metricsConfig", '{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}') as "metricsConfig"
FROM "users" u
INNER JOIN "organization" o ON u.id = o.owner_id
LIMIT 1;

--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "serverIp";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "certificateType";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "https";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "host";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "letsEncryptEmail";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "sshPrivateKey";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "enableDockerCleanup";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "logCleanupCron";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "metricsConfig";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "cleanupCacheApplications";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "cleanupCacheOnPreviews";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "cleanupCacheOnCompose";