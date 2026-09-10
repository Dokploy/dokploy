CREATE TYPE "public"."sandboxNetworkMode" AS ENUM('isolated', 'internet');--> statement-breakpoint
CREATE TYPE "public"."sandboxStatus" AS ENUM('creating', 'running', 'killed', 'error');--> statement-breakpoint
CREATE TABLE "sandbox" (
	"sandboxId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"environmentId" text NOT NULL,
	"serverId" text,
	"image" text NOT NULL,
	"template" text,
	"containerId" text,
	"status" "sandboxStatus" DEFAULT 'creating' NOT NULL,
	"cpu" real DEFAULT 1 NOT NULL,
	"memoryMb" integer DEFAULT 512 NOT NULL,
	"pidsLimit" integer DEFAULT 256 NOT NULL,
	"timeoutMs" integer DEFAULT 300000 NOT NULL,
	"expiresAt" timestamp with time zone,
	"lastActivityAt" timestamp with time zone,
	"networkMode" "sandboxNetworkMode" DEFAULT 'isolated' NOT NULL,
	"envVars" text,
	"workdir" text DEFAULT '/home/user' NOT NULL,
	"user" text,
	"runtime" text,
	"createdAt" text NOT NULL,
	"killedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sandbox" ADD CONSTRAINT "sandbox_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox" ADD CONSTRAINT "sandbox_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;