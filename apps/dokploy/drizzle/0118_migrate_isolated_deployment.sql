-- Migration 118: Convert isolatedDeployment to customNetworkIds
--
-- This migration converts all compose services using isolatedDeployment=true
-- to use the new customNetworkIds system with proper network tracking.
--
-- Context: Composes with isolatedDeployment=true already have Docker networks
-- created with the name = compose.appName. We just need to import them into
-- the database and link them to the composes.

DO $$
DECLARE
    compose_record RECORD;
    new_network_id TEXT;
    org_id TEXT;
    proj_id TEXT;
BEGIN
    RAISE NOTICE 'Starting migration 0118: Convert isolatedDeployment to customNetworkIds';

    -- Loop through all composes with isolatedDeployment=true
    FOR compose_record IN
        SELECT
            c."composeId",
            c.name,
            c."appName",
            c."environmentId",
            c."serverId",
            c."customNetworkIds",
            e."projectId",
            p."organizationId"
        FROM compose c
        JOIN environment e ON c."environmentId" = e."environmentId"
        JOIN project p ON e."projectId" = p."projectId"
        WHERE c."isolatedDeployment" = true
    LOOP
        RAISE NOTICE 'Processing compose: % (ID: %)', compose_record.name, compose_record."composeId";

        org_id := compose_record."organizationId";
        proj_id := compose_record."projectId";

        -- Check if network already exists in database
        SELECT "networkId" INTO new_network_id
        FROM network
        WHERE "networkName" = compose_record."appName"
          AND "organizationId" = org_id;

        -- Create network record if it doesn't exist
        IF new_network_id IS NULL THEN
            RAISE NOTICE '  Creating network entry for: %', compose_record."appName";

            -- Generate a new network ID
            new_network_id := 'net_' || substring(md5(random()::text) from 1 for 16);

            -- Determine driver based on serverId (overlay for remote, bridge for local)
            INSERT INTO network (
                "networkId",
                name,
                description,
                "networkName",
                driver,
                "isDefault",
                attachable,
                internal,
                "organizationId",
                "projectId",
                "serverId",
                "createdAt"
            ) VALUES (
                new_network_id,
                'Isolated Network (' || compose_record."appName" || ')',
                'Migrated from isolatedDeployment feature',
                compose_record."appName",
                (CASE WHEN compose_record."serverId" IS NOT NULL THEN 'overlay' ELSE 'bridge' END)::"networkDriver",
                false,
                true,
                false,
                org_id,
                proj_id,
                compose_record."serverId",
                NOW()
            );

            RAISE NOTICE '  Created network: % (ID: %)', compose_record."appName", new_network_id;
        ELSE
            RAISE NOTICE '  Network already exists: % (ID: %)', compose_record."appName", new_network_id;
        END IF;

        -- Add network to customNetworkIds if not already there
        IF compose_record."customNetworkIds" IS NULL OR
           NOT (new_network_id = ANY(compose_record."customNetworkIds")) THEN

            RAISE NOTICE '  Assigning network to compose';

            UPDATE compose
            SET "customNetworkIds" = COALESCE("customNetworkIds", ARRAY[]::text[]) || ARRAY[new_network_id]
            WHERE "composeId" = compose_record."composeId";
        ELSE
            RAISE NOTICE '  Network already assigned';
        END IF;

        -- Set isolatedDeployment to false
        UPDATE compose
        SET "isolatedDeployment" = false
        WHERE "composeId" = compose_record."composeId";

        RAISE NOTICE '  ✓ Compose migrated successfully';
    END LOOP;

    RAISE NOTICE 'Migration 0118 completed successfully';
END $$;
