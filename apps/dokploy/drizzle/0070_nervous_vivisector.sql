ALTER TABLE "project" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "destination" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "registry" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "ssh-key" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "git_provider" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination" ADD CONSTRAINT "destination_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry" ADD CONSTRAINT "registry_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh-key" ADD CONSTRAINT "ssh-key_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_provider" ADD CONSTRAINT "git_provider_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;