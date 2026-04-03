CREATE TABLE "webServerSettings" (
	"id" text PRIMARY KEY NOT NULL,
	"serverIp" text,
	"certificateType" "certificateType" DEFAULT 'none' NOT NULL,
	"https" boolean DEFAULT false NOT NULL,
	"host" text,
	"letsEncryptEmail" text,
	"sshPrivateKey" text,
	"enableDockerCleanup" boolean DEFAULT true NOT NULL,
	"logCleanupCron" text DEFAULT '0 0 * * *',
	"metricsConfig" jsonb DEFAULT '{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}'::jsonb NOT NULL,
	"cleanupCacheApplications" boolean DEFAULT false NOT NULL,
	"cleanupCacheOnPreviews" boolean DEFAULT false NOT NULL,
	"cleanupCacheOnCompose" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Migrate data from user table to webServerSettings
-- Get the owner user's data and insert into webServerSettings
INSERT INTO "webServerSettings" (
	"id",
	"serverIp",
	"certificateType",
	"https",
	"host",
	"letsEncryptEmail",
	"sshPrivateKey",
	"enableDockerCleanup",
	"logCleanupCron",
	"metricsConfig",
	"cleanupCacheApplications",
	"cleanupCacheOnPreviews",
	"cleanupCacheOnCompose",
	"created_at",
	"updated_at"
)
SELECT 
	gen_random_uuid()::text as "id",
	u."serverIp",
	COALESCE(u."certificateType", 'none') as "certificateType",
	COALESCE(u."https", false) as "https",
	u."host",
	u."letsEncryptEmail",
	u."sshPrivateKey",
	COALESCE(u."enableDockerCleanup", true) as "enableDockerCleanup",
	COALESCE(u."logCleanupCron", '0 0 * * *') as "logCleanupCron",
	COALESCE(
		u."metricsConfig",
		'{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}'::jsonb
	) as "metricsConfig",
	COALESCE(u."cleanupCacheApplications", false) as "cleanupCacheApplications",
	COALESCE(u."cleanupCacheOnPreviews", false) as "cleanupCacheOnPreviews",
	COALESCE(u."cleanupCacheOnCompose", false) as "cleanupCacheOnCompose",
	NOW() as "created_at",
	NOW() as "updated_at"
FROM "user" u
INNER JOIN "member" m ON u."id" = m."user_id"
WHERE m."role" = 'owner'
ORDER BY m."created_at" ASC
LIMIT 1;

-- If no owner found, create a default entry
INSERT INTO "webServerSettings" (
	"id",
	"serverIp",
	"certificateType",
	"https",
	"host",
	"letsEncryptEmail",
	"sshPrivateKey",
	"enableDockerCleanup",
	"logCleanupCron",
	"metricsConfig",
	"cleanupCacheApplications",
	"cleanupCacheOnPreviews",
	"cleanupCacheOnCompose",
	"created_at",
	"updated_at"
)
SELECT 
	gen_random_uuid()::text as "id",
	NULL as "serverIp",
	'none' as "certificateType",
	false as "https",
	NULL as "host",
	NULL as "letsEncryptEmail",
	NULL as "sshPrivateKey",
	true as "enableDockerCleanup",
	'0 0 * * *' as "logCleanupCron",
	'{"server":{"type":"Dokploy","refreshRate":60,"port":4500,"token":"","retentionDays":2,"cronJob":"","urlCallback":"","thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}'::jsonb as "metricsConfig",
	false as "cleanupCacheApplications",
	false as "cleanupCacheOnPreviews",
	false as "cleanupCacheOnCompose",
	NOW() as "created_at",
	NOW() as "updated_at"
WHERE NOT EXISTS (
	SELECT 1 FROM "webServerSettings"
);


--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "serverIp";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "certificateType";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "https";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "host";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "letsEncryptEmail";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "sshPrivateKey";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "enableDockerCleanup";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "logCleanupCron";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "metricsConfig";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "cleanupCacheApplications";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "cleanupCacheOnPreviews";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "cleanupCacheOnCompose";