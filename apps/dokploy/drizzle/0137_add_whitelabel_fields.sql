-- Add whitelabel fields to webServerSettings table
ALTER TABLE "webServerSettings" ADD COLUMN IF NOT EXISTS "whitelabelLogoUrl" text;
ALTER TABLE "webServerSettings" ADD COLUMN IF NOT EXISTS "whitelabelBrandName" text;
ALTER TABLE "webServerSettings" ADD COLUMN IF NOT EXISTS "whitelabelTagline" text;
