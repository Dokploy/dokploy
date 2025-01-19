CREATE TABLE IF NOT EXISTS "ai" (
	"authId" text PRIMARY KEY NOT NULL,
	"apiUrl" text NOT NULL,
	"apiKey" text NOT NULL,
	"model" text NOT NULL,
	"isEnabled" boolean DEFAULT true NOT NULL
);
