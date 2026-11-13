import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApplicationNested, Domain } from "@dokploy/server";
import {
	createPathMiddlewares,
	deleteAllMiddlewares,
	noIndexMiddlewareName,
	removePathMiddlewares,
} from "@dokploy/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parse } from "yaml";

const state = vi.hoisted(() => ({ dir: "" }));

vi.mock("@dokploy/server/constants", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/constants")>()),
	paths: () => ({ DYNAMIC_TRAEFIK_PATH: state.dir }),
}));

const app = {
	appName: "my-app",
	serverId: null,
} as unknown as ApplicationNested;

const domain: Domain = {
	applicationId: "app-1",
	certificateType: "none",
	createdAt: "",
	domainId: "domain-1",
	host: "app.example.com",
	https: false,
	path: null,
	port: 3000,
	customEntrypoint: null,
	serviceName: "my-app",
	composeId: "",
	customCertResolver: null,
	domainType: "application",
	uniqueConfigKey: 7,
	previewDeploymentId: "",
	internalPath: "/",
	stripPath: false,
	middlewares: null,
	forwardAuthEnabled: false,
	noIndex: false,
	enabled: true,
};

const name = noIndexMiddlewareName("my-app", 7);
const readMiddlewares = () =>
	parse(readFileSync(join(state.dir, "middlewares.yml"), "utf8")).http
		?.middlewares ?? {};

describe("noindex middleware in middlewares.yml", () => {
	beforeEach(() => {
		state.dir = mkdtempSync(join(tmpdir(), "dokploy-noindex-"));
		writeFileSync(
			join(state.dir, "middlewares.yml"),
			"http:\n  middlewares:\n    redirect-to-https:\n      redirectScheme:\n        scheme: https\n",
		);
	});

	afterEach(() => {
		rmSync(state.dir, { recursive: true, force: true });
	});

	test("writes the X-Robots-Tag header middleware when enabled", async () => {
		await createPathMiddlewares(app, { ...domain, noIndex: true });
		expect(readMiddlewares()[name]).toEqual({
			headers: {
				customResponseHeaders: { "X-Robots-Tag": "noindex, nofollow" },
			},
		});
		expect(readMiddlewares()["redirect-to-https"]).toBeDefined();
	});

	test("removes a stale middleware when the option is turned off", async () => {
		await createPathMiddlewares(app, { ...domain, noIndex: true });
		await createPathMiddlewares(app, { ...domain, noIndex: false });
		expect(readMiddlewares()[name]).toBeUndefined();
		expect(readMiddlewares()["redirect-to-https"]).toBeDefined();
	});

	test("removes a stale middleware when other path middlewares remain", async () => {
		await createPathMiddlewares(app, { ...domain, noIndex: true });
		await createPathMiddlewares(app, {
			...domain,
			noIndex: false,
			path: "/api",
			stripPath: true,
		});
		expect(readMiddlewares()[name]).toBeUndefined();
		expect(readMiddlewares()["stripprefix-my-app-7"]).toBeDefined();
	});

	test("removes the middleware when the domain is deleted", async () => {
		await createPathMiddlewares(app, { ...domain, noIndex: true });
		await removePathMiddlewares(app, 7);
		expect(readMiddlewares()[name]).toBeUndefined();
	});

	test("removes every noindex middleware of an app when the app is deleted", async () => {
		const sibling = {
			appName: "my-app-2",
			serverId: null,
		} as ApplicationNested;
		await createPathMiddlewares(app, { ...domain, noIndex: true });
		await createPathMiddlewares(app, {
			...domain,
			uniqueConfigKey: 8,
			noIndex: true,
		});
		await createPathMiddlewares(sibling, { ...domain, noIndex: true });

		await deleteAllMiddlewares({
			...app,
			security: [],
			redirects: [],
		} as ApplicationNested);

		const remaining = Object.keys(readMiddlewares());
		expect(remaining).not.toContain(name);
		expect(remaining).not.toContain(noIndexMiddlewareName("my-app", 8));
		expect(remaining).toContain(noIndexMiddlewareName("my-app-2", 7));
		expect(remaining).toContain("redirect-to-https");
	});

	test("removes a preview deployment's middleware when it is deleted", async () => {
		const preview = {
			appName: "my-app-preview-abc123",
			serverId: null,
			security: [],
			redirects: [],
		} as unknown as ApplicationNested;
		await createPathMiddlewares(preview, {
			...domain,
			domainType: "preview",
			noIndex: true,
		});
		await createPathMiddlewares(app, { ...domain, noIndex: true });

		await deleteAllMiddlewares(preview);

		expect(readMiddlewares()[name]).toBeDefined();
		expect(
			readMiddlewares()[noIndexMiddlewareName("my-app-preview-abc123", 7)],
		).toBeUndefined();
	});

	test("keeps the entries of apps saved at the same time", async () => {
		const other = { appName: "other-app", serverId: null } as ApplicationNested;
		await Promise.all([
			createPathMiddlewares(app, { ...domain, noIndex: true }),
			createPathMiddlewares(other, {
				...domain,
				uniqueConfigKey: 1,
				noIndex: true,
			}),
		]);
		expect(readMiddlewares()[name]).toBeDefined();
		expect(
			readMiddlewares()[noIndexMiddlewareName("other-app", 1)],
		).toBeDefined();
	});
});
