import {
	applyCompressionToMainConfig,
	COMPRESS_MIDDLEWARE_NAME,
	COMPRESS_MIDDLEWARE_REF,
	getCompressionMiddlewareConfig,
	getDefaultServerTraefikConfig,
	isCompressionEnabledInMainConfig,
	type MainTraefikConfig,
} from "@dokploy/server";
import { describe, expect, test } from "vitest";
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
