import { db } from "@dokploy/server/db";
import { type apiCreateRegistry, registry } from "@dokploy/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { IS_CLOUD } from "../constants";

export type Registry = typeof registry.$inferSelect;

function shEscape(s: string | undefined): string {
	if (!s) return "''";
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function safeDockerLoginCommand(
	registry: string | undefined,
	user: string | undefined,
	pass: string | undefined,
) {
	const escapedRegistry = shEscape(registry);
	const escapedUser = shEscape(user);
	const escapedPassword = shEscape(pass);
	return `printf %s ${escapedPassword} | docker login ${escapedRegistry} -u ${escapedUser} --password-stdin`;
}

export const createRegistry = async (
	input: z.infer<typeof apiCreateRegistry>,
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
		const loginCommand = safeDockerLoginCommand(
			input.registryUrl,
			input.username,
			input.password,
		);
		if (input.serverId && input.serverId !== "none") {
			await execAsyncRemote(input.serverId, loginCommand);
		} else if (newRegistry.registryType === "cloud") {
			await execAsync(loginCommand);
		}

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

		if (!IS_CLOUD) {
			await execAsync(`docker logout ${response.registryUrl}`);
		}

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

		const loginCommand = safeDockerLoginCommand(
			response?.registryUrl,
			response?.username,
			response?.password,
		);

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

		if (registryData?.serverId && registryData?.serverId !== "none") {
			await execAsyncRemote(registryData.serverId, loginCommand);
		} else if (response?.registryType === "cloud") {
			await execAsync(loginCommand);
		}

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

async function getDockerHubToken(
	username: string,
	password: string,
): Promise<string> {
	const res = await fetch("https://hub.docker.com/v2/users/login/", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username, password }),
	});
	if (!res.ok) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Docker Hub authentication failed",
		});
	}
	const data = (await res.json()) as { token: string };
	return data.token;
}

function makeBasicAuth(username: string, password: string): string {
	return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

const DOCKER_HUB_HOSTS = new Set([
	"",
	"docker.io",
	"index.docker.io",
	"registry-1.docker.io",
	"registry.hub.docker.com",
]);

function isDockerHubUrl(registryUrl: string | null | undefined): boolean {
	return !registryUrl || DOCKER_HUB_HOSTS.has(registryUrl.toLowerCase());
}

function isGhcrUrl(registryUrl: string | null | undefined): boolean {
	return !!registryUrl && registryUrl.toLowerCase() === "ghcr.io";
}

async function listGhcrImages(
	username: string,
	password: string,
	imagePrefix: string | null | undefined,
	search?: string,
): Promise<string[]> {
	const namespace = imagePrefix || username;
	const headers = {
		Authorization: `Bearer ${password}`,
		Accept: "application/vnd.github.v3+json",
	};

	// GitHub has separate endpoints for user vs org packages — try both
	let res = await fetch(
		`https://api.github.com/users/${namespace}/packages?package_type=container&per_page=100`,
		{ headers },
	);
	if (!res.ok) {
		res = await fetch(
			`https://api.github.com/orgs/${namespace}/packages?package_type=container&per_page=100`,
			{ headers },
		);
	}
	if (!res.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `GHCR image list failed: ${res.statusText}`,
		});
	}

	const packages = (await res.json()) as { name: string }[];
	// Docker requires all image refs to be lowercase; GHCR namespaces are case-insensitive
	const ns = namespace.toLowerCase();
	let names = packages.map((p) => `ghcr.io/${ns}/${p.name.toLowerCase()}`);

	if (search) {
		names = names.filter((n) =>
			n.toLowerCase().includes(search.toLowerCase()),
		);
	}
	return names.slice(0, 50);
}

async function getOciBearerToken(
	wwwAuthenticate: string,
	username: string,
	password: string,
): Promise<string> {
	const params: Record<string, string> = {};
	const bearerContent = wwwAuthenticate.substring("Bearer ".length);
	for (const match of bearerContent.matchAll(/(\w+)="([^"]+)"/g)) {
		params[match[1] as string] = match[2] as string;
	}
	if (!params.realm) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid WWW-Authenticate header from registry",
		});
	}
	const url = new URL(params.realm);
	if (params.service) url.searchParams.set("service", params.service);
	if (params.scope) url.searchParams.set("scope", params.scope);

	const tokenRes = await fetch(url.toString(), {
		headers: { Authorization: makeBasicAuth(username, password) },
	});
	if (!tokenRes.ok) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Registry authentication failed",
		});
	}
	const tokenData = (await tokenRes.json()) as {
		token?: string;
		access_token?: string;
	};
	const token = tokenData.token ?? tokenData.access_token;
	if (!token) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "No token received from registry",
		});
	}
	return token;
}

async function fetchWithOciAuth(
	url: string,
	username: string,
	password: string,
): Promise<Response> {
	let res = await fetch(url, {
		headers: { Authorization: makeBasicAuth(username, password) },
	});
	if (res.status === 401) {
		const wwwAuth = res.headers.get("WWW-Authenticate") ?? "";
		if (wwwAuth.startsWith("Bearer ")) {
			const token = await getOciBearerToken(wwwAuth, username, password);
			res = await fetch(url, {
				headers: { Authorization: `Bearer ${token}` },
			});
		}
	}
	return res;
}

async function listDockerHubImages(
	username: string,
	password: string,
	imagePrefix: string | null | undefined,
	search?: string,
): Promise<string[]> {
	const token = await getDockerHubToken(username, password);
	const namespace = imagePrefix || username;
	const searchParam = search ? `&name=${encodeURIComponent(search)}` : "";
	const url = `https://hub.docker.com/v2/repositories/${namespace}/?page_size=50${searchParam}`;
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Docker Hub image list failed: ${res.statusText}`,
		});
	}
	const data = (await res.json()) as { results: { name: string }[] };
	return data.results.map((r) => `${namespace}/${r.name}`);
}

async function listDockerHubTags(
	username: string,
	password: string,
	imagePrefix: string | null | undefined,
	imageName: string,
): Promise<string[]> {
	const token = await getDockerHubToken(username, password);
	const namespace = imagePrefix || username;
	// imageName may arrive as "namespace/repo" — strip namespace prefix before building URL
	const bareImage = imageName.startsWith(`${namespace}/`)
		? imageName.slice(namespace.length + 1)
		: imageName;
	const url = `https://hub.docker.com/v2/repositories/${namespace}/${bareImage}/tags/?page_size=50`;
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Docker Hub tag list failed: ${res.statusText}`,
		});
	}
	const data = (await res.json()) as { results: { name: string }[] };
	return data.results.map((r) => r.name);
}

async function listOciImages(
	registryUrl: string,
	username: string,
	password: string,
	imagePrefix: string | null | undefined,
	search?: string,
): Promise<string[]> {
	const base = registryUrl.startsWith("http")
		? registryUrl
		: `https://${registryUrl}`;
	const res = await fetchWithOciAuth(
		`${base}/v2/_catalog?n=100`,
		username,
		password,
	);
	if (!res.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `OCI catalog failed: ${res.statusText}`,
		});
	}
	const data = (await res.json()) as { repositories: string[] };
	let repos = data.repositories ?? [];
	if (imagePrefix) {
		repos = repos.filter((r) => r.startsWith(imagePrefix));
	}
	const filtered = search
		? repos.filter((r) => r.toLowerCase().includes(search.toLowerCase()))
		: repos;
	const hostPrefix = base.replace(/^https?:\/\//, "");
	return filtered.slice(0, 50).map((r) => `${hostPrefix}/${r}`);
}

async function listOciTags(
	registryUrl: string,
	username: string,
	password: string,
	imageName: string,
): Promise<string[]> {
	const base = registryUrl.startsWith("http")
		? registryUrl
		: `https://${registryUrl}`;
	// imageName may arrive as "registryhost/repo" — strip host prefix before building the OCI path
	const registryHost = base.replace(/^https?:\/\//, "");
	const bareImage = imageName.startsWith(`${registryHost}/`)
		? imageName.slice(registryHost.length + 1)
		: imageName;
	const res = await fetchWithOciAuth(
		`${base}/v2/${bareImage}/tags/list?n=100`,
		username,
		password,
	);
	if (!res.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `OCI tag list failed for "${imageName}": ${res.statusText}`,
		});
	}
	const data = (await res.json()) as { tags: string[] | null };
	return data.tags ?? [];
}

export const listRegistryImages = async (
	registryId: string,
	search?: string,
): Promise<string[]> => {
	const reg = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
	});
	if (!reg) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Registry not found" });
	}
	if (isGhcrUrl(reg.registryUrl)) {
		return listGhcrImages(reg.username, reg.password, reg.imagePrefix, search);
	}
	if (isDockerHubUrl(reg.registryUrl)) {
		return listDockerHubImages(reg.username, reg.password, reg.imagePrefix, search);
	}
	return listOciImages(reg.registryUrl, reg.username, reg.password, reg.imagePrefix, search);
};

export const listRegistryTags = async (
	registryId: string,
	imageName: string,
	search?: string,
): Promise<string[]> => {
	const reg = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
	});
	if (!reg) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Registry not found" });
	}
	let tags: string[];
	if (isDockerHubUrl(reg.registryUrl)) {
		tags = await listDockerHubTags(
			reg.username,
			reg.password,
			reg.imagePrefix,
			imageName,
		);
	} else {
		tags = await listOciTags(
			reg.registryUrl,
			reg.username,
			reg.password,
			imageName,
		);
	}
	const withoutLatest = tags.filter((t) => t !== "latest");
	const result = tags.includes("latest") ? ["latest", ...withoutLatest] : withoutLatest;
	const filtered = search
		? result.filter((t) => t.toLowerCase().includes(search.toLowerCase()))
		: result;
	return filtered.slice(0, 50);
};
