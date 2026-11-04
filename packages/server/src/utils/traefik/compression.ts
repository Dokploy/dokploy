import { writeFileSync } from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { isMap, isSeq, parse, parseDocument, stringify } from "yaml";
import { writeFileRemote } from "../process/execAsync";
import { readConfigInPath } from "./application";
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

// writeTraefikConfigInPath swallows errors; a silent failure here would leave
// traefik.yml pointing at a middleware that was never written.
const writeFileOrThrow = async (
	filePath: string,
	content: string,
	serverId?: string,
) => {
	if (serverId) {
		await writeFileRemote(serverId, filePath, content);
	} else {
		writeFileSync(filePath, content, "utf8");
	}
};

// Entrypoints are static configuration: Traefik must be restarted afterwards.
export const updateTraefikCompression = async (
	enabled: boolean,
	serverId?: string,
) => {
	const mainConfigPath = getMainConfigPath(serverId);

	const mainConfig = await readConfigInPath(mainConfigPath, serverId);
	if (!mainConfig) {
		throw new Error("Traefik main config (traefik.yml) not found");
	}

	const updatedMainConfig = applyCompressionToMainConfig(mainConfig, enabled);

	// The middleware definition is written before traefik.yml references it and
	// is never deleted: the running Traefik keeps the old entrypoint config until
	// it restarts, so removing the definition would break every route in the
	// meantime (or for good, if the restart fails). An unused middleware is harmless.
	if (enabled) {
		await writeFileOrThrow(
			getCompressConfigPath(serverId),
			stringify(getCompressionMiddlewareConfig()),
			serverId,
		);
	}
	await writeFileOrThrow(mainConfigPath, updatedMainConfig, serverId);
};
