CREATE TYPE "public"."serviceAttribute" AS ENUM('fqdn', 'hostname', 'port');--> statement-breakpoint
CREATE TYPE "public"."serviceLinkType" AS ENUM('application', 'compose', 'postgres', 'mysql', 'mariadb', 'mongo', 'redis');--> statement-breakpoint
CREATE TABLE "serviceLink" (
	"serviceLinkId" text PRIMARY KEY NOT NULL,
	"sourceServiceId" text NOT NULL,
	"sourceServiceType" "serviceLinkType" NOT NULL,
	"targetServiceId" text NOT NULL,
	"targetServiceType" "serviceLinkType" NOT NULL,
	"attribute" "serviceAttribute" NOT NULL,
	"envVariableName" text NOT NULL,
	"createdAt" text NOT NULL
);
