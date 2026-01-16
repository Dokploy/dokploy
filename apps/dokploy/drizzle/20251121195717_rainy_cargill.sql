-- Fix inconsistent date formats in environment.createdAt field
-- Convert PostgreSQL timestamp format to ISO 8601 format
-- This addresses issue #2992 where old environments have PostgreSQL timestamp format
-- while new ones have ISO 8601 format

UPDATE "environment"
SET "createdAt" = to_char("createdAt"::timestamptz, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE "createdAt" NOT LIKE '%T%';

