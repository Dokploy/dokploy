import { db } from "@dokploy/server/db";
import { type apiCreateRegistry, registry } from "@dokploy/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";

export type Registry = typeof registry.$inferSelect;

const DOCKER_HUB_CONFIG_KEY = "https://index.docker.io/v1/";

function shEscape(s: string | undefined | null): string {
	if (!s) return "''";
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

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

function buildDockerConfigUpdateCommand(
	registryUrl: string | null | undefined,
	username: string | null | undefined,
	password: string | null | undefined,
	credentialHelper: string | null | undefined,
	removeEntry = false,
) {
	const registryKey = getRegistryConfigKey(registryUrl);
	const authValue = getAuthValue(username, password);

	return `mkdir -p /root/.docker && PYTHON_BIN=$(command -v python3 || command -v python) && if [ -z "$PYTHON_BIN" ]; then echo "python3 or python is required to update /root/.docker/config.json" >&2; exit 1; fi && REGISTRY_KEY=${shEscape(registryKey)} AUTH_VALUE=${shEscape(authValue)} CREDENTIAL_HELPER=${shEscape(credentialHelper || "")} REMOVE_ENTRY='${removeEntry ? "1" : "0"}' "$PYTHON_BIN" - <<'PY'
import json
import os

path = '/root/.docker/config.json'

try:
    with open(path, 'r', encoding='utf-8') as f:
        config = json.load(f)
except FileNotFoundError:
    config = {}
except Exception:
    config = {}

if not isinstance(config, dict):
    config = {}

auths = config.get('auths') if isinstance(config.get('auths'), dict) else {}
cred_helpers = config.get('credHelpers') if isinstance(config.get('credHelpers'), dict) else {}

registry_key = os.environ.get('REGISTRY_KEY', '').strip()
auth_value = os.environ.get('AUTH_VALUE', '').strip()
credential_helper = os.environ.get('CREDENTIAL_HELPER', '').strip()
remove_entry = os.environ.get('REMOVE_ENTRY', '0') == '1'

if registry_key:
    if remove_entry:
        auths.pop(registry_key, None)
        cred_helpers.pop(registry_key, None)
    else:
        if auth_value:
            auths[registry_key] = {'auth': auth_value}
        else:
            auths.pop(registry_key, None)

        if credential_helper:
            cred_helpers[registry_key] = credential_helper
        else:
            cred_helpers.pop(registry_key, None)

if auths:
    config['auths'] = auths
else:
    config.pop('auths', None)

if cred_helpers:
    config['credHelpers'] = cred_helpers
else:
    config.pop('credHelpers', None)

with open(path, 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=2)
    f.write('\\n')
PY`;
}

async function syncDockerRegistryConfig(
	serverId: string | null | undefined,
	registryType: Registry["registryType"] | undefined,
	registryUrl: string | null | undefined,
	username: string | null | undefined,
	password: string | null | undefined,
	credentialHelper: string | null | undefined,
	removeEntry = false,
) {
	const command = buildDockerConfigUpdateCommand(
		registryUrl,
		username,
		password,
		credentialHelper,
		removeEntry,
	);

	if (serverId && serverId !== "none") {
		await execAsyncRemote(serverId, command);
		return;
	}

	if (registryType === "cloud") {
		await execAsync(command);
	}
}

function ensureRegistryAuthInput(
	authType: string | null | undefined,
	username?: string | null,
	password?: string | null,
	credentialHelper?: string | null,
) {
	if (authType === "credential-helper") {
		if (!hasValue(credentialHelper)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Credential helper name is required.",
			});
		}
		return;
	}

	if (!hasValue(username) || !hasValue(password)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Username and password are required for credential authentication.",
		});
	}
}

export const createRegistry = async (
	input: typeof apiCreateRegistry._type,
	organizationId: string,
) => {
	return await db.transaction(async (tx) => {
		const newRegistry = await tx
			.insert(registry)
			.values({
				...input,
				organizationId: organizationId,
			})
			.returning()
			.then((value) => value[0]);

		if (!newRegistry) {
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
			input.authType,
			input.username,
			input.password,
			input.credentialHelper,
		);

		await syncDockerRegistryConfig(
			input.serverId,
			newRegistry.registryType,
			input.registryUrl,
			input.authType === "credential-helper" ? null : input.username,
			input.authType === "credential-helper" ? null : input.password,
			input.authType === "credential-helper" ? input.credentialHelper : null,
		);

		return newRegistry;
	});
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

		await syncDockerRegistryConfig(
			null,
			response.registryType,
			response.registryUrl,
			response.username,
			response.password,
			response.credentialHelper,
			true,
		);

		return response;
	} catch (error) {
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

		const authType = response?.authType ?? "credentials";

		await syncDockerRegistryConfig(
			registryData.serverId,
			response?.registryType,
			response?.registryUrl,
			authType === "credential-helper" ? null : response?.username,
			authType === "credential-helper" ? null : response?.password,
			authType === "credential-helper" ? response?.credentialHelper : null,
		);

		return response;
	} catch (error) {
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
