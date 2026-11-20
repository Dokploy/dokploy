import { db } from "@dokploy/server/db";
import { libredbStudio } from "@dokploy/server/db/schema";
import type { MountSettings, Placement } from "dockerode";
import { eq } from "drizzle-orm";
import { ExecError } from "../process/ExecError";
import { getRemoteDocker } from "../servers/remote-docker";
import {
	LIBREDB_STUDIO_CONFIG_DIR,
	LIBREDB_STUDIO_SEED_FILE,
	LIBREDB_STUDIO_SEED_TTL_MS,
} from "./constants";
import { mergeContainerEnv } from "./env";
import { LAUNCH_TOKEN_ISSUER } from "./launch-token";
import {
	STUDIO_SECRETS_DECRYPTION_FAILED_MESSAGE,
	studioSecretsAreDecrypted,
} from "./secrets";
import { runLibreDBStudioSync } from "./sync";
import { getStudioSeedPaths } from "./writer";

export interface LibreDBStudioDeployOverrides {
	mounts: { Type: "bind"; Source: string; Target: string; ReadOnly: true }[];
	env: string[];
	placementConstraint: string;
}

export interface LibreDBStudioContainerSpec {
	env: string[];
	mounts: MountSettings[];
	placement: Placement | undefined;
}

const describeError = (error: unknown): string => {
	if (error instanceof ExecError) return error.getDetailedMessage();
	return error instanceof Error ? error.message : String(error);
};

export const getLibreDBStudioDeployOverrides = async (application: {
	applicationId: string;
	appName: string;
	serverId: string | null;
}): Promise<LibreDBStudioDeployOverrides | null> => {
	const studio = await db.query.libredbStudio.findFirst({
		where: eq(libredbStudio.applicationId, application.applicationId),
		with: { application: { columns: { appName: true } } },
	});
	if (!studio) return null;

	// A preview deployment reuses the application's id under its own appName:
	// its seed directory would not exist, and its service would carry the
	// Studio's secrets.
	if (application.appName !== studio.application.appName) {
		throw new Error("LibreDB Studio does not support preview deployments");
	}
	if (!studioSecretsAreDecrypted(studio)) {
		throw new Error(STUDIO_SECRETS_DECRYPTION_FAILED_MESSAGE);
	}

	try {
		await runLibreDBStudioSync(studio.libredbStudioId, { force: true });
	} catch (error) {
		// deployApplication copies only non-ExecError messages into the deployment
		// log, so a failed remote seed write would otherwise leave no reason there.
		const message = `LibreDB Studio seed sync failed: ${describeError(error)}`;
		throw new Error(message, { cause: error });
	}

	// The seed directory exists only on the host Dokploy just wrote to, so the
	// task must not land on another manager of a multi-node swarm.
	const docker = await getRemoteDocker(application.serverId);
	const info = await docker.info();
	const nodeId: unknown = info?.Swarm?.NodeID;
	if (typeof nodeId !== "string" || nodeId === "") {
		throw new Error(
			`Cannot deploy LibreDB Studio ${application.appName}: Docker reports no Swarm node id for the host that holds its seed directory`,
		);
	}

	const { seedDir } = getStudioSeedPaths(
		application.appName,
		application.serverId,
	);
	return {
		mounts: [
			{
				Type: "bind",
				Source: seedDir,
				Target: LIBREDB_STUDIO_CONFIG_DIR,
				ReadOnly: true,
			},
		],
		env: [
			`SEED_CONFIG_PATH=${LIBREDB_STUDIO_CONFIG_DIR}/${LIBREDB_STUDIO_SEED_FILE}`,
			`SEED_CACHE_TTL_MS=${LIBREDB_STUDIO_SEED_TTL_MS}`,
			`ALLOW_CUSTOM_CONNECTIONS=${studio.allowCustomConnections ? "true" : "false"}`,
			// Dokploy members control the seed values, so Studio must take them
			// literally instead of resolving env or Vault references in them.
			"SEED_LITERAL_VALUES=true",
			// The secrets come from the libredb_studio row, never from the
			// application env: application.one returns that env decrypted to every
			// member who can read the Studio, and JWT_SECRET signs Studio sessions.
			`LAUNCH_TOKEN_SECRET=${studio.launchSecret}`,
			`LAUNCH_TOKEN_AUDIENCE=${studio.libredbStudioId}`,
			`LAUNCH_TOKEN_ISSUER=${LAUNCH_TOKEN_ISSUER}`,
			`JWT_SECRET=${studio.jwtSecret}`,
			`ADMIN_PASSWORD=${studio.adminPassword}`,
		],
		placementConstraint: `node.id==${nodeId}`,
	};
};

export const applyLibreDBStudioDeployOverrides = (
	spec: LibreDBStudioContainerSpec,
	overrides: LibreDBStudioDeployOverrides | null,
): LibreDBStudioContainerSpec => {
	if (!overrides) return spec;
	return {
		env: mergeContainerEnv(spec.env, overrides.env),
		mounts: [...spec.mounts, ...overrides.mounts],
		placement: {
			...spec.placement,
			Constraints: [
				...(spec.placement?.Constraints ?? []),
				overrides.placementConstraint,
			],
		},
	};
};
