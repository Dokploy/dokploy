DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'gitea' AND 
                 enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sourceType')) THEN
        ALTER TYPE "public"."sourceType" ADD VALUE 'gitea' BEFORE 'drop';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'gitea' AND 
                 enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sourceTypeCompose')) THEN
        ALTER TYPE "public"."sourceTypeCompose" ADD VALUE 'gitea' BEFORE 'raw';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'gitea' AND 
                 enumtypid = (SELECT oid FROM pg_type WHERE typname = 'gitProviderType')) THEN
        ALTER TYPE "public"."gitProviderType" ADD VALUE 'gitea';
    END IF;
END
$$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gitea') THEN
        CREATE TABLE "gitea" (
			"giteaId" text PRIMARY KEY NOT NULL,
			"giteaUrl" text DEFAULT 'https://gitea.com' NOT NULL,
			"redirect_uri" text,
			"client_id" text,
			"client_secret" text,
			"gitProviderId" text NOT NULL,
			"gitea_username" text,
			"access_token" text,
			"refresh_token" text,
			"expires_at" integer,
			"scopes" text DEFAULT 'repo,repo:status,read:user,read:org',
			"last_authenticated_at" integer
        );
    END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'application' AND column_name = 'giteaProjectId') THEN
        ALTER TABLE "application" ADD COLUMN "giteaProjectId" integer;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'application' AND column_name = 'giteaRepository') THEN
        ALTER TABLE "application" ADD COLUMN "giteaRepository" text;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'application' AND column_name = 'giteaOwner') THEN
        ALTER TABLE "application" ADD COLUMN "giteaOwner" text;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'application' AND column_name = 'giteaBranch') THEN
        ALTER TABLE "application" ADD COLUMN "giteaBranch" text;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'application' AND column_name = 'giteaBuildPath') THEN
        ALTER TABLE "application" ADD COLUMN "giteaBuildPath" text DEFAULT '/';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'application' AND column_name = 'giteaPathNamespace') THEN
        ALTER TABLE "application" ADD COLUMN "giteaPathNamespace" text;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'application' AND column_name = 'giteaId') THEN
        ALTER TABLE "application" ADD COLUMN "giteaId" text;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compose' AND column_name = 'giteaRepository') THEN
        ALTER TABLE "compose" ADD COLUMN "giteaRepository" text;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compose' AND column_name = 'giteaOwner') THEN
        ALTER TABLE "compose" ADD COLUMN "giteaOwner" text;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compose' AND column_name = 'giteaBranch') THEN
        ALTER TABLE "compose" ADD COLUMN "giteaBranch" text;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compose' AND column_name = 'giteaId') THEN
        ALTER TABLE "compose" ADD COLUMN "giteaId" text;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'gitea_gitProviderId_git_provider_gitProviderId_fk'
    ) THEN
        ALTER TABLE "gitea" ADD CONSTRAINT "gitea_gitProviderId_git_provider_gitProviderId_fk" 
        FOREIGN KEY ("gitProviderId") REFERENCES "public"."git_provider"("gitProviderId") 
        ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'application_giteaId_gitea_giteaId_fk'
    ) THEN
        ALTER TABLE "application" ADD CONSTRAINT "application_giteaId_gitea_giteaId_fk" 
        FOREIGN KEY ("giteaId") REFERENCES "public"."gitea"("giteaId") 
        ON DELETE set null ON UPDATE no action;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'compose_giteaId_gitea_giteaId_fk'
    ) THEN
        ALTER TABLE "compose" ADD CONSTRAINT "compose_giteaId_gitea_giteaId_fk" 
        FOREIGN KEY ("giteaId") REFERENCES "public"."gitea"("giteaId") 
        ON DELETE set null ON UPDATE no action;
    END IF;
END $$;