ALTER TYPE "public"."domainType" ADD VALUE 'externalUpstream';--> statement-breakpoint
CREATE TABLE "externalUpstream" (
	"externalUpstreamId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"description" text,
	"targetUrl" text NOT NULL,
	"passHostHeader" boolean DEFAULT true NOT NULL,
	"applicationStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"createdAt" text NOT NULL,
	"environmentId" text NOT NULL,
	"serverId" text,
	CONSTRAINT "externalUpstream_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "externalUpstreamId" text;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "externalUpstreamsEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "externalUpstreamBlockedCidrs" text[] DEFAULT ARRAY['127.0.0.0/8','169.254.0.0/16','0.0.0.0/8','::1/128','fe80::/10']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "externalUpstream" ADD CONSTRAINT "externalUpstream_environmentId_environment_environmentId_fk" FOREIGN KEY ("environmentId") REFERENCES "public"."environment"("environmentId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externalUpstream" ADD CONSTRAINT "externalUpstream_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain" ADD CONSTRAINT "domain_externalUpstreamId_externalUpstream_externalUpstreamId_fk" FOREIGN KEY ("externalUpstreamId") REFERENCES "public"."externalUpstream"("externalUpstreamId") ON DELETE cascade ON UPDATE no action;