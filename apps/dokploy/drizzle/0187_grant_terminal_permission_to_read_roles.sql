-- Grant the new "server.terminal" permission to existing custom roles that already have
-- "server.read", which is the permission that surfaces the terminal in the UI today.
-- Roles without a "server" entry are deliberately left alone: they never saw the terminal in the
-- UI, so from now on they are denied at the websocket too.
UPDATE "organization_role" AS r
SET "permission" = jsonb_set(
	r."permission"::jsonb,
	'{server}',
	(r."permission"::jsonb->'server') || '["terminal"]'::jsonb
)::text
WHERE jsonb_typeof(r."permission"::jsonb->'server') = 'array'
AND r."permission"::jsonb->'server' @> '["read"]'::jsonb
AND NOT r."permission"::jsonb->'server' @> '["terminal"]'::jsonb;
