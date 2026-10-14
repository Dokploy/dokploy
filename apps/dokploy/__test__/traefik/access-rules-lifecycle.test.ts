import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationNested, Compose, Domain } from "@dokploy/server";
import { domainAccessRule } from "@dokploy/server/db/validations/domain";
import { addDomainToCompose } from "@dokploy/server/utils/docker/domain";
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

const renderAccessRule = async (
	renderer: "file" | "docker-compose" | "stack",
	rule: Domain["accessRules"][number],
) => {
	const input = {
		...domain,
		path: "/",
		internalPath: "/",
		stripPath: false,
		serviceName: "app",
		accessRules: [rule],
	};
	if (renderer === "file") {
		await manageDomain(app, input);
		const config = parse(
			fs.readFileSync(path.join(dynamicPath, "access-lifecycle.yml"), "utf8"),
		);
		return config.http.routers["access-lifecycle-access-1-web-0"].rule;
	}
	const compose = {
		appName: app.appName,
		composeType: renderer,
		sourceType: "raw",
		composeFile: "services:\n  app:\n    image: nginx\n",
	} as Compose;
	const result = await addDomainToCompose(compose, [input]);
	const service = result?.services?.app;
	const labels = (
		renderer === "stack" ? service?.deploy?.labels : service?.labels
	) as string[];
	const prefix = "traefik.http.routers.access-lifecycle-access-1-web-0.rule=";
	return labels.find((label) => label.startsWith(prefix))?.slice(prefix.length);
};

for (const pathType of ["exact", "prefix", "regexp"] as const) {
	// Balanced parentheses keep this payload valid even under the regexp check.
	const maliciousPath = "/(admin`) || PathPrefix(`/)";
	const rule = {
		enabled: true,
		priority: 100,
		pathType,
		path: maliciousPath,
		ipAllowList: ["10.0.0.0/8"],
		excludedIPs: [],
	};
	test(`${pathType} validation rejects matcher delimiter injection`, () => {
		const result = domainAccessRule.safeParse(rule);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toContainEqual(
				expect.objectContaining({
					path: ["path"],
					message: "Rule path must not contain backticks",
				}),
			);
		}
	});
	for (const renderer of ["file", "docker-compose", "stack"] as const) {
		test(`${renderer} rejects stored ${pathType} matcher injection`, async () => {
			await expect(renderAccessRule(renderer, rule)).rejects.toThrow(
				"Rule path must not contain backticks",
			);
		});
		test(`${renderer} preserves ${pathType} and explicit advanced matchers`, async () => {
			const path =
				pathType === "regexp" ? "^/admin/(users|teams)/\\d+$" : "/admin";
			const matcher = {
				exact: "Path",
				prefix: "PathPrefix",
				regexp: "PathRegexp",
			}[pathType];
			const safeRule = { ...rule, path };
			expect(domainAccessRule.safeParse(safeRule).success).toBe(true);
			const expected = `${matcher}(\`${path}\`)`;
			expect(await renderAccessRule(renderer, safeRule)).toBe(
				`Host(\`example.com\`) && (${expected})`,
			);
			const matcherExpression = "(Method(`GET`) || Method(`HEAD`))";
			const advanced = { ...safeRule, matcherExpression };
			expect(domainAccessRule.safeParse(advanced).success).toBe(true);
			expect(await renderAccessRule(renderer, advanced)).toBe(
				`Host(\`example.com\`) && (${expected} && ${matcherExpression})`,
			);
		});
	}
}

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
