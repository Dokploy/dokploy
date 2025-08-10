CREATE TABLE "cloud_storage_destination" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"username" text,
	"password" text,
	"host" text,
	"port" text,
	"config" text,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cloud_storage_backup" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"cloud_storage_destination_id" uuid NOT NULL,
	"schedule" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"database_type" text NOT NULL,
	"prefix" text,
	"database" text,
	"postgres_id" text,
	"mysql_id" text,
	"mariadb_id" text,
	"mongo_id" text,
	"keep_latest_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloud_storage_backup" ADD CONSTRAINT "cloud_storage_backup_cloud_storage_destination_id_cloud_storage_destination_id_fk" FOREIGN KEY ("cloud_storage_destination_id") REFERENCES "public"."cloud_storage_destination"("id") ON DELETE no action ON UPDATE no action;