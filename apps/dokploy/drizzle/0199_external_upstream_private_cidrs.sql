ALTER TABLE "webServerSettings" ALTER COLUMN "externalUpstreamBlockedCidrs" SET DEFAULT ARRAY['127.0.0.0/8','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','169.254.0.0/16','0.0.0.0/8','::1/128','fc00::/7','fe80::/10']::text[];
UPDATE "webServerSettings"
SET "externalUpstreamBlockedCidrs" = ARRAY['127.0.0.0/8','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','169.254.0.0/16','0.0.0.0/8','::1/128','fc00::/7','fe80::/10']::text[]
WHERE "externalUpstreamBlockedCidrs" = ARRAY['127.0.0.0/8','169.254.0.0/16','0.0.0.0/8','::1/128','fe80::/10']::text[];
