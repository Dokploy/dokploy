import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationNested, Domain } from "@dokploy/server";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { createPathMiddlewares } from "@dokploy/server/utils/traefik/middleware";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { parse } from "yaml";

let cwd: string;
let dynamicPath: string;
const app = {
	appName: "access-lifecycle",
	redirects: [],
	security: [],
	serverId: null,
} as unknown as ApplicationNested;
const domain: Domain = {
	applicationId: "app",
	composeId: null,
	createdAt: "",
	customCertResolver: null,
	customEntrypoint: null,
	domainType: "application",
	middlewares: [],
	previewDeploymentId: null,
	serviceName: null,
	domainId: "domain",
	uniqueConfigKey: 1,
	host: "example.com",
	enabled: true,
	https: false,
	path: "/api",
	internalPath: "/internal",
	stripPath: true,
	forwardAuthEnabled: false,
	certificateType: "none",
	port: 3000,
	accessRules: [
		{
			enabled: true,
			priority: 100,
			path: "/api/admin",
			pathType: "prefix",
			ipAllowList: ["10.0.0.0/8"],
			excludedIPs: [],
		},
	],
};

beforeEach(() => {
	cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-access-lifecycle-"));
	dynamicPath = path.join(cwd, ".docker", "traefik", "dynamic");
	fs.mkdirSync(dynamicPath, { recursive: true });
	vi.spyOn(process, "cwd").mockReturnValue(cwd);
});
afterEach(() => {
	vi.restoreAllMocks();
	fs.rmSync(cwd, { recursive: true, force: true });
});

test("path rewriting and access middleware can be created, updated and cleared together", async () => {
	await createPathMiddlewares(app, domain);
	await createPathMiddlewares(app, domain);
	const read = () =>
		parse(fs.readFileSync(path.join(dynamicPath, "middlewares.yml"), "utf8"));
	expect(read().http.middlewares["stripprefix-access-lifecycle-1"]).toEqual({
		stripPrefix: { prefixes: ["/api"] },
	});
	expect(
		read().http.middlewares["access-access-lifecycle-1-0-prefix-1-ipallow"],
	).toEqual({ ipAllowList: { sourceRange: ["10.0.0.0/8"] } });
	await createPathMiddlewares(app, {
		...domain,
		internalPath: "/",
		stripPath: false,
		accessRules: [],
	});
	expect(read()?.http?.middlewares ?? {}).toEqual({});
});

test("disabling an application removes access routers and middleware", async () => {
	await manageDomain(app, { ...domain, internalPath: "/", stripPath: false });
	const configPath = path.join(dynamicPath, "access-lifecycle.yml");
	const config = parse(fs.readFileSync(configPath, "utf8"));
	expect(config.http.routers["access-lifecycle-access-1-web-0"].rule).toContain(
		"/api/admin",
	);
	await manageDomain(app, { ...domain, enabled: false });
	expect(fs.existsSync(configPath)).toBe(false);
	const middlewares = parse(
		fs.readFileSync(path.join(dynamicPath, "middlewares.yml"), "utf8"),
	);
	expect(middlewares?.http?.middlewares ?? {}).toEqual({});
});
