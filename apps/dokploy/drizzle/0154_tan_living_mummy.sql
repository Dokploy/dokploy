ALTER TYPE "public"."databaseType" ADD VALUE 'libsql';--> statement-breakpoint
ALTER TABLE "libsql" DROP CONSTRAINT "libsql_bottomlessReplicationDestinationId_destination_destinationId_fk";
--> statement-breakpoint
ALTER TABLE "backup" ADD COLUMN "libsqlId" text;--> statement-breakpoint
ALTER TABLE "backup" ADD CONSTRAINT "backup_libsqlId_libsql_libsqlId_fk" FOREIGN KEY ("libsqlId") REFERENCES "public"."libsql"("libsqlId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "libsql" DROP COLUMN "enableBottomlessReplication";--> statement-breakpoint
ALTER TABLE "libsql" DROP COLUMN "bottomlessReplicationDestinationId";