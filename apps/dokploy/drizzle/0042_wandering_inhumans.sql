ALTER TABLE "postgres" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "mariadb" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "mongo" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "mysql" ADD COLUMN "serverId" text;--> statement-breakpoint
ALTER TABLE "redis" ADD COLUMN "serverId" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "postgres" ADD CONSTRAINT "postgres_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mariadb" ADD CONSTRAINT "mariadb_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mongo" ADD CONSTRAINT "mongo_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mysql" ADD CONSTRAINT "mysql_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redis" ADD CONSTRAINT "redis_serverId_server_serverId_fk" FOREIGN KEY ("serverId") REFERENCES "public"."server"("serverId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
