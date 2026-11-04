import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	applyCompressionToMainConfig,
	COMPRESS_MIDDLEWARE_NAME,
	COMPRESS_MIDDLEWARE_REF,
	getCompressionMiddlewareConfig,
	getDefaultServerTraefikConfig,
	getTraefikCompressionStatus,
	isCompressionEnabledInMainConfig,
	type MainTraefikConfig,
	updateTraefikCompression,
} from "@dokploy/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parse } from "yaml";

const entryPointMiddlewares = (yaml: string, entryPoint: string) =>
	(parse(yaml) as MainTraefikConfig).entryPoints?.[entryPoint]?.http
		?.middlewares;

describe("applyCompressionToMainConfig", () => {
	test("adds the middleware to the web and websecure entrypoints", () => {
		const result = applyCompressionToMainConfig(
			getDefaultServerTraefikConfig(),
			true,
		);

		expect(entryPointMiddlewares(result, "web")).toEqual([
			COMPRESS_MIDDLEWARE_REF,
		]);
		expect(entryPointMiddlewares(result, "websecure")).toEqual([
			COMPRESS_MIDDLEWARE_REF,
		]);
	});

	test("keeps the rest of the websecure entrypoint config", () => {
		const result = parse(
			applyCompressionToMainConfig(getDefaultServerTraefikConfig(), true),
		) as MainTraefikConfig;

		expect(result.entryPoints?.websecure?.http?.tls?.certResolver).toBe(
			"letsencrypt",
		);
		expect(result.entryPoints?.websecure?.http3).toEqual({
			advertisedPort: 443,
		});
		expect(result.certificatesResolvers?.letsencrypt?.acme?.email).toBe(
			"test@localhost.com",
		);
	});

	test("keeps middlewares already set by the user", () => {
		const config = `entryPoints:
  web:
    address: :80
    http:
      middlewares:
        - my-headers@file
`;
		const result = applyCompressionToMainConfig(config, true);

		expect(entryPointMiddlewares(result, "web")).toEqual([
			"my-headers@file",
			COMPRESS_MIDDLEWARE_REF,
		]);
	});

	test("keeps user comments", () => {
		const config = `# managed by ops team
entryPoints:
  web:
    address: :80 # public http
`;
		const result = applyCompressionToMainConfig(config, true);

		expect(result).toContain("# managed by ops team");
		expect(result).toContain("# public http");
	});

	test("is idempotent when enabling twice", () => {
		const once = applyCompressionToMainConfig(
			getDefaultServerTraefikConfig(),
			true,
		);
		const twice = applyCompressionToMainConfig(once, true);

		expect(twice).toBe(once);
		expect(entryPointMiddlewares(twice, "web")).toEqual([
			COMPRESS_MIDDLEWARE_REF,
		]);
	});

	test("skips entrypoints that do not exist", () => {
		const config = `entryPoints:
  web:
    address: :80
`;
		const result = parse(
			applyCompressionToMainConfig(config, true),
		) as MainTraefikConfig;

		expect(result.entryPoints?.websecure).toBeUndefined();
	});

	test("does not touch custom entrypoints", () => {
		const config = `entryPoints:
  web:
    address: :80
  metrics:
    address: :8082
`;
		const result = applyCompressionToMainConfig(config, true);

		expect(entryPointMiddlewares(result, "metrics")).toBeUndefined();
	});

	test("disabling restores the original config", () => {
		const original = getDefaultServerTraefikConfig();
		const enabled = applyCompressionToMainConfig(original, true);
		const disabled = applyCompressionToMainConfig(enabled, false);

		expect(parse(disabled)).toEqual(parse(original));
	});

	test("disabling only removes the compression middleware", () => {
		const config = `entryPoints:
  web:
    address: :80
    http:
      middlewares:
        - my-headers@file
        - ${COMPRESS_MIDDLEWARE_REF}
`;
		const result = applyCompressionToMainConfig(config, false);

		expect(entryPointMiddlewares(result, "web")).toEqual(["my-headers@file"]);
	});

	test("disabling when it was never enabled changes nothing", () => {
		const original = getDefaultServerTraefikConfig();

		expect(parse(applyCompressionToMainConfig(original, false))).toEqual(
			parse(original),
		);
	});

	test("throws on invalid yaml instead of overwriting it", () => {
		expect(() =>
			applyCompressionToMainConfig("entryPoints:\n  web: [unclosed", true),
		).toThrow(/Invalid traefik.yml/);
	});
});

describe("isCompressionEnabledInMainConfig", () => {
	test("is false for the default config", () => {
		expect(
			isCompressionEnabledInMainConfig(getDefaultServerTraefikConfig()),
		).toBe(false);
	});

	test("is true after enabling", () => {
		expect(
			isCompressionEnabledInMainConfig(
				applyCompressionToMainConfig(getDefaultServerTraefikConfig(), true),
			),
		).toBe(true);
	});

	test("is false for an empty file", () => {
		expect(isCompressionEnabledInMainConfig("")).toBe(false);
	});
});

describe("getCompressionMiddlewareConfig", () => {
	test("only compresses text-based content types", () => {
		const middleware =
			getCompressionMiddlewareConfig().http?.middlewares?.[
				COMPRESS_MIDDLEWARE_NAME
			];
		const compress =
			middleware && "compress" in middleware ? middleware.compress : undefined;

		expect(compress?.encodings).toEqual(["zstd", "br", "gzip"]);
		expect(compress?.includedContentTypes).toContain("text/html");
		expect(compress?.includedContentTypes).toContain("application/json");
		expect(compress?.includedContentTypes).not.toContain("video/mp4");
		expect(compress?.excludedContentTypes).toBeUndefined();
	});
});

describe("updateTraefikCompression (local server)", () => {
	let baseDir: string;
	let mainConfigPath: string;
	let dynamicDir: string;
	let compressConfigPath: string;

	beforeEach(() => {
		baseDir = mkdtempSync(path.join(tmpdir(), "dokploy-compress-"));
		vi.spyOn(process, "cwd").mockReturnValue(baseDir);
		const traefikDir = path.join(baseDir, ".docker", "traefik");
		dynamicDir = path.join(traefikDir, "dynamic");
		mkdirSync(dynamicDir, { recursive: true });
		mainConfigPath = path.join(traefikDir, "traefik.yml");
		compressConfigPath = path.join(
			dynamicDir,
			`${COMPRESS_MIDDLEWARE_NAME}.yml`,
		);
		writeFileSync(mainConfigPath, getDefaultServerTraefikConfig());
	});

	afterEach(() => {
		chmodSync(dynamicDir, 0o755);
		vi.restoreAllMocks();
		rmSync(baseDir, { recursive: true, force: true });
	});

	test("enabling writes the middleware and references it", async () => {
		await updateTraefikCompression(true);

		expect(existsSync(compressConfigPath)).toBe(true);
		expect(await getTraefikCompressionStatus()).toBe(true);
	});

	test("disabling keeps the middleware definition so running routes don't break before the restart", async () => {
		await updateTraefikCompression(true);
		await updateTraefikCompression(false);

		expect(await getTraefikCompressionStatus()).toBe(false);
		expect(existsSync(compressConfigPath)).toBe(true);
		expect(parse(readFileSync(mainConfigPath, "utf8"))).toEqual(
			parse(getDefaultServerTraefikConfig()),
		);
	});

	test("does not reference the middleware when writing its definition fails", async () => {
		chmodSync(dynamicDir, 0o500);

		await expect(updateTraefikCompression(true)).rejects.toThrow();
		expect(readFileSync(mainConfigPath, "utf8")).toBe(
			getDefaultServerTraefikConfig(),
		);
	});

	test("interleaved enable/disable always leaves a valid config", async () => {
		await Promise.all([
			updateTraefikCompression(true),
			updateTraefikCompression(false),
			updateTraefikCompression(true),
		]);

		if (await getTraefikCompressionStatus()) {
			expect(existsSync(compressConfigPath)).toBe(true);
		}
	});

	test("fails when traefik.yml does not exist", async () => {
		rmSync(mainConfigPath);

		await expect(updateTraefikCompression(true)).rejects.toThrow(/traefik.yml/);
	});
});
