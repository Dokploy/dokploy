import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { quote } from "shell-quote";
import { isMap, isSeq, parse, parseDocument, stringify } from "yaml";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { readConfigInPath, writeTraefikConfigInPath } from "./application";
import type { FileConfig } from "./file-types";
import type { MainTraefikConfig } from "./types";

export const COMPRESS_MIDDLEWARE_NAME = "dokploy-compress";
export const COMPRESS_MIDDLEWARE_REF = `${COMPRESS_MIDDLEWARE_NAME}@file`;
const COMPRESS_CONFIG_FILE = `${COMPRESS_MIDDLEWARE_NAME}.yml`;
const COMPRESS_ENTRYPOINTS = ["web", "websecure"] as const;

// Only text-based responses: compressing media or archives wastes CPU and
// breaks clients that rely on byte ranges (video players, resumable downloads).
export const COMPRESS_CONTENT_TYPES = [
	"text/html",
	"text/css",
	"text/plain",
	"text/xml",
	"text/javascript",
	"application/javascript",
	"application/json",
	"application/ld+json",
	"application/manifest+json",
	"application/xml",
	"application/rss+xml",
	"application/atom+xml",
	"application/wasm",
	"image/svg+xml",
];

export const getCompressionMiddlewareConfig = (): FileConfig => ({
	http: {
		middlewares: {
			[COMPRESS_MIDDLEWARE_NAME]: {
				compress: {
					encodings: ["zstd", "br", "gzip"],
					includedContentTypes: COMPRESS_CONTENT_TYPES,
				},
			},
		},
	},
});

export const isCompressionEnabledInMainConfig = (mainConfig: string) => {
	const config = (parse(mainConfig) || {}) as MainTraefikConfig;
	return COMPRESS_ENTRYPOINTS.some((entryPoint) =>
		config.entryPoints?.[entryPoint]?.http?.middlewares?.includes(
			COMPRESS_MIDDLEWARE_REF,
		),
	);
};

// traefik.yml is user-editable, so it is edited as a YAML document instead of
// parse/stringify to keep the user's comments and customizations.
export const applyCompressionToMainConfig = (
	mainConfig: string,
	enabled: boolean,
) => {
	const doc = parseDocument(mainConfig);
	if (doc.errors.length > 0) {
		throw new Error(`Invalid traefik.yml: ${doc.errors[0]?.message}`);
	}

	for (const entryPoint of COMPRESS_ENTRYPOINTS) {
		const entryPointPath = ["entryPoints", entryPoint];
		if (!isMap(doc.getIn(entryPointPath))) {
			continue;
		}

		const httpPath = [...entryPointPath, "http"];
		const middlewaresPath = [...httpPath, "middlewares"];
		const middlewares = doc.getIn(middlewaresPath);
		const current = isSeq(middlewares)
			? (middlewares.toJSON() as unknown[])
			: [];
		const index = current.indexOf(COMPRESS_MIDDLEWARE_REF);

		if (enabled) {
			if (index !== -1) continue;
			if (isSeq(middlewares)) {
				middlewares.add(doc.createNode(COMPRESS_MIDDLEWARE_REF));
			} else {
				doc.setIn(middlewaresPath, doc.createNode([COMPRESS_MIDDLEWARE_REF]));
			}
			continue;
		}

		if (index === -1 || !isSeq(middlewares)) continue;
		middlewares.delete(index);
		if (middlewares.items.length === 0) {
			doc.deleteIn(middlewaresPath);
		}
		const http = doc.getIn(httpPath);
		if (isMap(http) && http.items.length === 0) {
			doc.deleteIn(httpPath);
		}
	}

	return doc.toString();
};

const getMainConfigPath = (serverId?: string) =>
	path.join(paths(!!serverId).MAIN_TRAEFIK_PATH, "traefik.yml");

const getCompressConfigPath = (serverId?: string) =>
	path.join(paths(!!serverId).DYNAMIC_TRAEFIK_PATH, COMPRESS_CONFIG_FILE);

export const getTraefikCompressionStatus = async (serverId?: string) => {
	const mainConfig = await readConfigInPath(
		getMainConfigPath(serverId),
		serverId,
	);
	if (!mainConfig) return false;
	return isCompressionEnabledInMainConfig(mainConfig);
};

// Entrypoints are static configuration: Traefik must be restarted afterwards.
export const updateTraefikCompression = async (
	enabled: boolean,
	serverId?: string,
) => {
	const mainConfigPath = getMainConfigPath(serverId);
	const compressConfigPath = getCompressConfigPath(serverId);

	const mainConfig = await readConfigInPath(mainConfigPath, serverId);
	if (!mainConfig) {
		throw new Error("Traefik main config (traefik.yml) not found");
	}

	const updatedMainConfig = applyCompressionToMainConfig(mainConfig, enabled);

	// The middleware definition must exist before traefik.yml references it,
	// and must outlive the reference when disabling, otherwise Traefik logs
	// "middleware does not exist" for every router in between.
	if (enabled) {
		await writeTraefikConfigInPath(
			compressConfigPath,
			stringify(getCompressionMiddlewareConfig()),
			serverId,
		);
		await writeTraefikConfigInPath(mainConfigPath, updatedMainConfig, serverId);
		return;
	}

	await writeTraefikConfigInPath(mainConfigPath, updatedMainConfig, serverId);
	const removeCommand = `rm -f ${quote([compressConfigPath])}`;
	if (serverId) {
		await execAsyncRemote(serverId, removeCommand);
	} else {
		await execAsync(removeCommand);
	}
};
