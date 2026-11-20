import type { ApplicationNested, Domain } from "@dokploy/server";
import { createDomainLabels, createRouterConfig } from "@dokploy/server";
import { describe, expect, it } from "vitest";

const app = {
	appName: "app",
	redirects: [],
	security: [],
} as unknown as ApplicationNested;

const baseDomain: Domain = {
	applicationId: "",
	certificateType: "none",
	createdAt: "",
	domainId: "",
	host: "example.com",
	https: false,
	path: null,
	port: 3000,
	customEntrypoint: null,
	serviceName: "web",
	composeId: "",
	customCertResolver: null,
	domainType: "application",
	uniqueConfigKey: 1,
	previewDeploymentId: "",
	internalPath: "/",
	stripPath: false,
	middlewares: null,
	forwardAuthEnabled: false,
	enabled: true,
};

// Inside a backtick-quoted rule string only a backtick ends the string.
const ruleBreakingHosts = [
	"a.example.com`) || Host(`studio.example.com",
	"a.example.com`)",
	"a.example.com\n",
	"a.example.com\u0000",
	"a.example.com\u007f",
];

const ruleBreakingPaths = [
	"/x`) || Host(`studio.example.com",
	"/x`)",
	"/x\r\n",
	"/x\t",
];

const builders = [
	[
		"createRouterConfig",
		(domain: Domain) => createRouterConfig(app, domain, "websecure"),
	],
	[
		"createDomainLabels",
		async (domain: Domain) => createDomainLabels("app", domain, "websecure"),
	],
] as const;

describe.each(builders)("%s", (_name, build) => {
	it.each(ruleBreakingHosts)("refuses the host %j", async (host) => {
		await expect(build({ ...baseDomain, host })).rejects.toThrow(
			"Invalid domain host.",
		);
	});

	it.each(ruleBreakingPaths)("refuses the path %j", async (path) => {
		await expect(build({ ...baseDomain, path })).rejects.toThrow(
			"Invalid domain path.",
		);
	});

	it.each(ruleBreakingPaths)("refuses the internal path %j", async (path) => {
		await expect(build({ ...baseDomain, internalPath: path })).rejects.toThrow(
			"Invalid domain internal path.",
		);
	});

	it.each([
		"example.com",
		"app.example.com",
		"api.v1.app.example.com",
		"my-app.example-host.com",
		"123.example.com",
		"localhost",
		"192.168.1.100",
		"my_app.example.com",
		"тест.рф",
		"app.тест.рф",
	])("builds the host %j", async (host) => {
		await expect(build({ ...baseDomain, host })).resolves.toBeDefined();
	});

	it.each([
		[null, "/"],
		["/", "/"],
		["/api", "/hello"],
		["/api/v1", "/"],
		["/api_v1", "/"],
		["/api-v1", "/"],
		["/api/v1/users", "/"],
		["/public", "/app/v2"],
		["/foo", ""],
	])(
		"builds the path %j with the internal path %j",
		async (path, internalPath) => {
			await expect(
				build({ ...baseDomain, path, internalPath }),
			).resolves.toBeDefined();
		},
	);
});

describe("createRouterConfig with an internationalized host", () => {
	it.each(["тест.рф", "сайт.ru", "app.тест.рф"])(
		"builds the punycode rule for %j",
		async (host) => {
			const router = await createRouterConfig(
				app,
				{ ...baseDomain, host },
				"web",
			);
			expect(router.rule).toMatch(/^Host\(`[a-z0-9.-]+`\)$/);
		},
	);

	// The IDNA mapping turns a fullwidth grave accent (U+FF40) into a backtick.
	it.each([
		"a\uff40,\uff40b",
		"app.example.com\uff40,\uff40studio.example.com",
	])(
		"refuses the host %j whose punycode form breaks the rule",
		async (host) => {
			await expect(
				createRouterConfig(app, { ...baseDomain, host }, "web"),
			).rejects.toThrow("Invalid domain host.");
		},
	);
});
