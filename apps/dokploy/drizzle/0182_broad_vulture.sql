ALTER TABLE "server" ALTER COLUMN "metricsConfig" SET DEFAULT '{"server":{"type":"Remote","refreshRate":60,"port":4500,"token":"","urlCallback":"","cronJob":"0 0 * * *","retentionDays":2,"thresholds":{"cpu":0,"memory":0}},"containers":{"refreshRate":60,"services":{"include":[],"exclude":[]}}}'::jsonb;--> statement-breakpoint
UPDATE "server"
SET "metricsConfig" = jsonb_set(
	"metricsConfig",
	'{server,cronJob}',
	'"0 0 * * *"'::jsonb
)
WHERE COALESCE(NULLIF(btrim("metricsConfig" -> 'server' ->> 'cronJob'), ''), '') = '';
