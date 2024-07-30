DO $$ BEGIN
 CREATE TYPE "buildType" AS ENUM('dockerfile', 'heroku_buildpacks', 'paketo_buildpacks', 'nixpacks');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "sourceType" AS ENUM('docker', 'git', 'github');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "Roles" AS ENUM('admin', 'user');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "databaseType" AS ENUM('postgres', 'mariadb', 'mysql', 'mongo');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "deploymentStatus" AS ENUM('running', 'done', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "mountType" AS ENUM('bind', 'volume', 'file');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "serviceType" AS ENUM('application', 'postgres', 'mysql', 'mariadb', 'mongo', 'redis');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "protocolType" AS ENUM('tcp', 'udp');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "applicationStatus" AS ENUM('idle', 'running', 'done', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "certificateType" AS ENUM('letsencrypt', 'none');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application" (
	"applicationId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"description" text,
	"env" text,
	"memoryReservation" integer,
	"memoryLimit" integer,
	"cpuReservation" integer,
	"cpuLimit" integer,
	"title" text,
	"enabled" boolean,
	"subtitle" text,
	"command" text,
	"customLogo" text,
	"customCss" text,
	"hideLogo" boolean,
	"hideLinks" boolean,
	"refreshToken" text,
	"sourceType" "sourceType" DEFAULT 'github' NOT NULL,
	"repository" text,
	"owner" text,
	"branch" text,
	"buildPath" text DEFAULT '/',
	"autoDeploy" boolean,
	"username" text,
	"password" text,
	"dockerImage" text,
	"customGitUrl" text,
	"customGitBranch" text,
	"customGitBuildPath" text,
	"customGitSSHKey" text,
	"dockerfile" text,
	"applicationStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"buildType" "buildType" DEFAULT 'nixpacks' NOT NULL,
	"createdAt" text NOT NULL,
	"projectId" text NOT NULL,
	CONSTRAINT "application_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "postgres" (
	"postgresId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"databaseName" text NOT NULL,
	"databaseUser" text NOT NULL,
	"databasePassword" text NOT NULL,
	"description" text,
	"dockerImage" text NOT NULL,
	"command" text,
	"env" text,
	"memoryReservation" integer,
	"externalPort" integer,
	"memoryLimit" integer,
	"cpuReservation" integer,
	"cpuLimit" integer,
	"applicationStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"createdAt" text NOT NULL,
	"projectId" text NOT NULL,
	CONSTRAINT "postgres_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"userId" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"isRegistered" boolean DEFAULT false NOT NULL,
	"expirationDate" timestamp(3) NOT NULL,
	"createdAt" text NOT NULL,
	"canCreateProjects" boolean DEFAULT false NOT NULL,
	"canCreateServices" boolean DEFAULT false NOT NULL,
	"canDeleteProjects" boolean DEFAULT false NOT NULL,
	"canDeleteServices" boolean DEFAULT false NOT NULL,
	"canAccessToTraefikFiles" boolean DEFAULT false NOT NULL,
	"accesedProjects" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"accesedServices" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"adminId" text NOT NULL,
	"authId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin" (
	"adminId" text PRIMARY KEY NOT NULL,
	"githubAppId" integer,
	"githubAppName" text,
	"serverIp" text,
	"certificateType" "certificateType" DEFAULT 'none' NOT NULL,
	"host" text,
	"githubClientId" text,
	"githubClientSecret" text,
	"githubInstallationId" text,
	"githubPrivateKey" text,
	"letsEncryptEmail" text,
	"sshPrivateKey" text,
	"enableDockerCleanup" boolean DEFAULT false NOT NULL,
	"authId" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"rol" "Roles" NOT NULL,
	"image" text,
	"createdAt" text NOT NULL,
	CONSTRAINT "auth_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project" (
	"projectId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"createdAt" text NOT NULL,
	"adminId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "domain" (
	"domainId" text PRIMARY KEY NOT NULL,
	"host" text NOT NULL,
	"https" boolean DEFAULT false NOT NULL,
	"port" integer DEFAULT 80,
	"path" text DEFAULT '/',
	"uniqueConfigKey" serial NOT NULL,
	"createdAt" text NOT NULL,
	"applicationId" text NOT NULL,
	"certificateType" "certificateType" DEFAULT 'none' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mariadb" (
	"mariadbId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"description" text,
	"databaseName" text NOT NULL,
	"databaseUser" text NOT NULL,
	"databasePassword" text NOT NULL,
	"rootPassword" text NOT NULL,
	"dockerImage" text NOT NULL,
	"command" text,
	"env" text,
	"memoryReservation" integer,
	"memoryLimit" integer,
	"cpuReservation" integer,
	"cpuLimit" integer,
	"externalPort" integer,
	"applicationStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"createdAt" text NOT NULL,
	"projectId" text NOT NULL,
	CONSTRAINT "mariadb_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mongo" (
	"mongoId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"description" text,
	"databaseUser" text NOT NULL,
	"databasePassword" text NOT NULL,
	"dockerImage" text NOT NULL,
	"command" text,
	"env" text,
	"memoryReservation" integer,
	"memoryLimit" integer,
	"cpuReservation" integer,
	"cpuLimit" integer,
	"externalPort" integer,
	"applicationStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"createdAt" text NOT NULL,
	"projectId" text NOT NULL,
	CONSTRAINT "mongo_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mysql" (
	"mysqlId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"description" text,
	"databaseName" text NOT NULL,
	"databaseUser" text NOT NULL,
	"databasePassword" text NOT NULL,
	"rootPassword" text NOT NULL,
	"dockerImage" text NOT NULL,
	"command" text,
	"env" text,
	"memoryReservation" integer,
	"memoryLimit" integer,
	"cpuReservation" integer,
	"cpuLimit" integer,
	"externalPort" integer,
	"applicationStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"createdAt" text NOT NULL,
	"projectId" text NOT NULL,
	CONSTRAINT "mysql_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backup" (
	"backupId" text PRIMARY KEY NOT NULL,
	"schedule" text NOT NULL,
	"enabled" boolean,
	"database" text NOT NULL,
	"prefix" text NOT NULL,
	"destinationId" text NOT NULL,
	"databaseType" "databaseType" NOT NULL,
	"postgresId" text,
	"mariadbId" text,
	"mysqlId" text,
	"mongoId" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "destination" (
	"destinationId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"accessKey" text NOT NULL,
	"secretAccessKey" text NOT NULL,
	"bucket" text NOT NULL,
	"region" text NOT NULL,
	"endpoint" text NOT NULL,
	"adminId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deployment" (
	"deploymentId" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" "deploymentStatus" DEFAULT 'running',
	"logPath" text NOT NULL,
	"applicationId" text NOT NULL,
	"createdAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mount" (
	"mountId" text PRIMARY KEY NOT NULL,
	"type" "mountType" NOT NULL,
	"hostPath" text,
	"volumeName" text,
	"content" text,
	"serviceType" "serviceType" DEFAULT 'application' NOT NULL,
	"mountPath" text NOT NULL,
	"applicationId" text,
	"postgresId" text,
	"mariadbId" text,
	"mongoId" text,
	"mysqlId" text,
	"redisId" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certificate" (
	"certificateId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"certificateData" text NOT NULL,
	"privateKey" text NOT NULL,
	"certificatePath" text NOT NULL,
	"autoRenew" boolean,
	CONSTRAINT "certificate_certificatePath_unique" UNIQUE("certificatePath")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redirect" (
	"redirectId" text PRIMARY KEY NOT NULL,
	"regex" text NOT NULL,
	"replacement" text NOT NULL,
	"permanent" boolean DEFAULT false NOT NULL,
	"uniqueConfigKey" serial NOT NULL,
	"createdAt" text NOT NULL,
	"applicationId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security" (
	"securityId" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"createdAt" text NOT NULL,
	"applicationId" text NOT NULL,
	CONSTRAINT "security_username_applicationId_unique" UNIQUE("username","applicationId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "port" (
	"portId" text PRIMARY KEY NOT NULL,
	"publishedPort" integer NOT NULL,
	"targetPort" integer NOT NULL,
	"protocol" "protocolType" NOT NULL,
	"applicationId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redis" (
	"redisId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"appName" text NOT NULL,
	"description" text,
	"password" text NOT NULL,
	"dockerImage" text NOT NULL,
	"command" text,
	"env" text,
	"memoryReservation" integer,
	"memoryLimit" integer,
	"cpuReservation" integer,
	"cpuLimit" integer,
	"externalPort" integer,
	"createdAt" text NOT NULL,
	"applicationStatus" "applicationStatus" DEFAULT 'idle' NOT NULL,
	"projectId" text NOT NULL,
	CONSTRAINT "redis_appName_unique" UNIQUE("appName")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application" ADD CONSTRAINT "application_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "project"("projectId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "postgres" ADD CONSTRAINT "postgres_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "project"("projectId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user" ADD CONSTRAINT "user_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user" ADD CONSTRAINT "user_authId_auth_id_fk" FOREIGN KEY ("authId") REFERENCES "auth"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin" ADD CONSTRAINT "admin_authId_auth_id_fk" FOREIGN KEY ("authId") REFERENCES "auth"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domain" ADD CONSTRAINT "domain_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "application"("applicationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mariadb" ADD CONSTRAINT "mariadb_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "project"("projectId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mongo" ADD CONSTRAINT "mongo_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "project"("projectId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mysql" ADD CONSTRAINT "mysql_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "project"("projectId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backup" ADD CONSTRAINT "backup_destinationId_destination_destinationId_fk" FOREIGN KEY ("destinationId") REFERENCES "destination"("destinationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backup" ADD CONSTRAINT "backup_postgresId_postgres_postgresId_fk" FOREIGN KEY ("postgresId") REFERENCES "postgres"("postgresId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backup" ADD CONSTRAINT "backup_mariadbId_mariadb_mariadbId_fk" FOREIGN KEY ("mariadbId") REFERENCES "mariadb"("mariadbId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backup" ADD CONSTRAINT "backup_mysqlId_mysql_mysqlId_fk" FOREIGN KEY ("mysqlId") REFERENCES "mysql"("mysqlId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backup" ADD CONSTRAINT "backup_mongoId_mongo_mongoId_fk" FOREIGN KEY ("mongoId") REFERENCES "mongo"("mongoId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "destination" ADD CONSTRAINT "destination_adminId_admin_adminId_fk" FOREIGN KEY ("adminId") REFERENCES "admin"("adminId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployment" ADD CONSTRAINT "deployment_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "application"("applicationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mount" ADD CONSTRAINT "mount_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "application"("applicationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mount" ADD CONSTRAINT "mount_postgresId_postgres_postgresId_fk" FOREIGN KEY ("postgresId") REFERENCES "postgres"("postgresId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mount" ADD CONSTRAINT "mount_mariadbId_mariadb_mariadbId_fk" FOREIGN KEY ("mariadbId") REFERENCES "mariadb"("mariadbId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mount" ADD CONSTRAINT "mount_mongoId_mongo_mongoId_fk" FOREIGN KEY ("mongoId") REFERENCES "mongo"("mongoId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mount" ADD CONSTRAINT "mount_mysqlId_mysql_mysqlId_fk" FOREIGN KEY ("mysqlId") REFERENCES "mysql"("mysqlId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mount" ADD CONSTRAINT "mount_redisId_redis_redisId_fk" FOREIGN KEY ("redisId") REFERENCES "redis"("redisId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_user_id_auth_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redirect" ADD CONSTRAINT "redirect_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "application"("applicationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security" ADD CONSTRAINT "security_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "application"("applicationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "port" ADD CONSTRAINT "port_applicationId_application_applicationId_fk" FOREIGN KEY ("applicationId") REFERENCES "application"("applicationId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redis" ADD CONSTRAINT "redis_projectId_project_projectId_fk" FOREIGN KEY ("projectId") REFERENCES "project"("projectId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
