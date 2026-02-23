import fs from "node:fs";
import path from "node:path";
import { db } from "@dokploy/server/db";
import {
	type apiCreateRegistry,
	registry,
	server,
} from "@dokploy/server/db/schema";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { IS_CLOUD } from "../constants";

export type Registry = typeof registry.$inferSelect;

const DOCKER_CONFIG_PATH = "/root/.docker/config.json";
const DOCKER_HUB_CONFIG_KEY = "https://index.docker.io/v1/";

function hasValue(value?: string | null): value is string {
	return Boolean(value?.trim());
}

function getRegistryConfigKey(registryUrl?: string | null): string {
	return hasValue(registryUrl) ? registryUrl.trim() : DOCKER_HUB_CONFIG_KEY;
}

function getAuthValue(
	username?: string | null,
	password?: string | null,
): string {
	if (!hasValue(username) || !hasValue(password)) {
		return "";
	}
	return Buffer.from(`${username}:${password}`).toString("base64");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCredentialHelperUrls(urls: string | null | undefined): string[] {
	if (!urls?.trim()) return [];
	return urls
		.split("\n")
		.map((u) => u.trim())
		.filter(Boolean);
}

function buildConfigFromRegistries(
	existingConfig: Record<string, unknown>,
	registries: Array<{
		registryUrl: string | null;
		username: string | null;
		password: string | null;
		credentialHelper: string | null;
		credentialHelperUrls: string | null;
	}>,
): Record<string, unknown> {
	const result = { ...existingConfig };
	const auths: Record<string, unknown> = {};
	const credHelpers: Record<string, unknown> = {};

	for (const reg of registries) {
		// Username/password → auths (keyed by registryUrl)
		const authValue = getAuthValue(reg.username, reg.password);
		if (authValue) {
			const key = getRegistryConfigKey(reg.registryUrl);
			auths[key] = { auth: authValue };
		}

		// Credential helper → credHelpers (keyed by each credentialHelperUrl)
		if (hasValue(reg.credentialHelper)) {
			const helperUrls = parseCredentialHelperUrls(reg.credentialHelperUrls);
			// Backward compat: if no credentialHelperUrls, fall back to registryUrl
			const urls =
				helperUrls.length > 0
					? helperUrls
					: hasValue(reg.registryUrl)
						? [reg.registryUrl.trim()]
						: [];
			for (const url of urls) {
				credHelpers[url] = reg.credentialHelper;
			}
		}
	}

	if (Object.keys(auths).length > 0) {
		result.auths = auths;
	} else {
		delete result.auths;
	}
	if (Object.keys(credHelpers).length > 0) {
		result.credHelpers = credHelpers;
	} else {
		delete result.credHelpers;
	}

	return result;
}

function configToJson(config: Record<string, unknown>): string {
	return `${JSON.stringify(config, null, "\t")}\n`;
}

function readDockerConfigLocal(): Record<string, unknown> {
	try {
		const content = fs.readFileSync(DOCKER_CONFIG_PATH, "utf-8");
		const config: unknown = JSON.parse(content);
		return isPlainObject(config) ? config : {};
	} catch {
		return {};
	}
}

function writeDockerConfigLocal(config: Record<string, unknown>): void {
	fs.mkdirSync(path.dirname(DOCKER_CONFIG_PATH), { recursive: true });
	fs.writeFileSync(DOCKER_CONFIG_PATH, configToJson(config), "utf-8");
}

async function readDockerConfigRemote(
	serverId: string,
): Promise<Record<string, unknown>> {
	try {
		const { stdout } = await execAsyncRemote(
			serverId,
			`cat ${DOCKER_CONFIG_PATH} 2>/dev/null || echo '{}'`,
		);
		const config: unknown = JSON.parse(stdout.trim() || "{}");
		return isPlainObject(config) ? config : {};
	} catch {
		return {};
	}
}

async function writeDockerConfigRemote(
	serverId: string,
	config: Record<string, unknown>,
): Promise<void> {
	const encoded = Buffer.from(configToJson(config)).toString("base64");
	await execAsyncRemote(
		serverId,
		`mkdir -p /root/.docker && printf '%s' '${encoded}' | base64 -d > ${DOCKER_CONFIG_PATH}`,
	);
}

async function getOrgRegistries(organizationId: string) {
	return db.query.registry.findMany({
		where: eq(registry.organizationId, organizationId),
	});
}

async function syncDockerRegistryConfig(
	serverId: string | null | undefined,
	organizationId: string | null | undefined,
) {
	const orgRegistries = await getOrgRegistries(organizationId ?? "");

	if (serverId === "all") {
		const servers = await db.query.server.findMany({
			where: and(
				isNotNull(server.sshKeyId),
				eq(server.organizationId, organizationId ?? ""),
			),
		});

		for (const srv of servers) {
			const config = await readDockerConfigRemote(srv.serverId);
			const updated = buildConfigFromRegistries(config, orgRegistries);
			await writeDockerConfigRemote(srv.serverId, updated);
		}

		if (!IS_CLOUD) {
			const config = readDockerConfigLocal();
			const updated = buildConfigFromRegistries(config, orgRegistries);
			writeDockerConfigLocal(updated);
		}
		return;
	}

	if (serverId && serverId !== "none") {
		const config = await readDockerConfigRemote(serverId);
		const updated = buildConfigFromRegistries(config, orgRegistries);
		await writeDockerConfigRemote(serverId, updated);
		return;
	}

	if (!IS_CLOUD) {
		const config = readDockerConfigLocal();
		const updated = buildConfigFromRegistries(config, orgRegistries);
		writeDockerConfigLocal(updated);
	}
}

function ensureRegistryAuthInput(
	username?: string | null,
	password?: string | null,
	credentialHelper?: string | null,
	credentialHelperUrls?: string | null,
) {
	const hasCredentials = hasValue(username) && hasValue(password);
	const hasCredHelper = hasValue(credentialHelper);

	if (!hasCredentials && !hasCredHelper) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"At least one authentication method is required (username/password or credential helper).",
		});
	}

	if (hasCredentials && (!hasValue(username) || !hasValue(password))) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Both username and password are required.",
		});
	}

	if (hasCredHelper && !hasValue(credentialHelperUrls)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "At least one registry URL is required for credential helpers.",
		});
	}
}

export const createRegistry = async (
	input: typeof apiCreateRegistry._type,
	organizationId: string,
) => {
	const newRegistry = await db.transaction(async (tx) => {
		const result = await tx
			.insert(registry)
			.values({
				...input,
				organizationId: organizationId,
			})
			.returning()
			.then((value) => value[0]);

		if (!result) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input:  Inserting registry",
			});
		}

		if (IS_CLOUD && !input.serverId && input.serverId !== "none") {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Select a server to add the registry",
			});
		}
		ensureRegistryAuthInput(
			input.username,
			input.password,
			input.credentialHelper,
			input.credentialHelperUrls,
		);

		return result;
	});

	await syncDockerRegistryConfig(input.serverId, organizationId);

	return newRegistry;
};

export const removeRegistry = async (registryId: string) => {
	try {
		const response = await db
			.delete(registry)
			.where(eq(registry.registryId, registryId))
			.returning()
			.then((res) => res[0]);

		if (!response) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Registry not found",
			});
		}

		await syncDockerRegistryConfig(null, response.organizationId);

		return response;
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error removing this registry",
			cause: error,
		});
	}
};

export const updateRegistry = async (
	registryId: string,
	registryData: Partial<Registry> & { serverId?: string | null },
) => {
	try {
		const response = await db
			.update(registry)
			.set({
				...registryData,
			})
			.where(eq(registry.registryId, registryId))
			.returning()
			.then((res) => res[0]);

		if (
			IS_CLOUD &&
			!registryData?.serverId &&
			registryData?.serverId !== "none"
		) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Select a server to add the registry",
			});
		}

		await syncDockerRegistryConfig(
			registryData.serverId,
			response?.organizationId,
		);

		return response;
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		const message =
			error instanceof Error ? error.message : "Error updating this registry";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}
};

export const findRegistryById = async (registryId: string) => {
	const registryResponse = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
		columns: {
			password: false,
		},
	});
	if (!registryResponse) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Registry not found",
		});
	}
	return registryResponse;
};

export const findAllRegistryByOrganizationId = async (
	organizationId: string,
) => {
	const registryResponse = await db.query.registry.findMany({
		where: eq(registry.organizationId, organizationId),
	});
	return registryResponse;
};
