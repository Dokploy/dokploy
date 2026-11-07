import type { DuplicateTargetServer } from "@dokploy/server/db/schema";
import type { createDomain, Domain } from "@dokploy/server/services/domain";
import { duplicateService } from "@dokploy/server/services/duplicate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findApplicationById: vi.fn(),
	createApplication: vi.fn(),
	findComposeById: vi.fn(),
	createCompose: vi.fn(),
	findServerById: vi.fn(),
	getWebServerSettings: vi.fn(),
	manageDomain: vi.fn(),
	insertDomain: vi.fn<(input: Parameters<typeof createDomain>[0]) => Domain>(),
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
	createApplication: mocks.createApplication,
}));

vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: mocks.findComposeById,
	createCompose: mocks.createCompose,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: mocks.manageDomain,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
			callback({
				insert: () => ({
					values: (input: Parameters<typeof createDomain>[0]) => ({
						returning: async () => [mocks.insertDomain(input)],
					}),
				}),
			}),
	},
}));

const sourceDomain: Domain = {
	domainId: "source-domain",
	host: "example.com",
	https: true,
	port: 3000,
	customEntrypoint: null,
	path: "/api",
	serviceName: "web",
	domainType: "application",
	uniqueConfigKey: 1,
	createdAt: "2026-09-01T00:00:00.000Z",
	composeId: null,
	customCertResolver: null,
	applicationId: "source",
	previewDeploymentId: null,
	certificateType: "letsencrypt",
	internalPath: "/",
	stripPath: true,
	middlewares: ["compression"],
	forwardAuthEnabled: false,
	enabled: true,
};

beforeEach(() => {
	vi.resetAllMocks();
	mocks.findServerById.mockResolvedValue({ ipAddress: "203.0.113.20" });
	mocks.getWebServerSettings.mockResolvedValue({ serverIp: "203.0.113.30" });
	mocks.insertDomain.mockImplementation((input) => ({
		...sourceDomain,
		...input,
		domainId: "copied-domain",
	}));
});

describe.each(["application", "compose"] as const)(
	"%s domain duplication",
	(type) => {
		const duplicate = async (
			domains: Domain[],
			targetServer: DuplicateTargetServer = {
				kind: "remote",
				serverId: "server-2",
			},
			sourceServerId: string | null = "server-1",
		) => {
			const serverId =
				targetServer.kind === "keep"
					? sourceServerId
					: targetServer.kind === "dokploy"
						? null
						: targetServer.serverId;
			const source = {
				applicationId: "source",
				composeId: "source",
				appName: "source-app-abcdef",
				name: "Source",
				serverId: sourceServerId,
				domains: domains.map((domain) => ({
					...domain,
					domainType: type,
					applicationId: type === "application" ? "source" : null,
					composeId: type === "compose" ? "source" : null,
				})),
				mounts: [],
				ports: [],
				redirects: [],
				security: [],
				previewDeployments: [],
			};
			const target = {
				applicationId: "copy",
				composeId: "copy",
				appName: "copy-app-abcdef",
				serverId,
			};
			mocks.findApplicationById.mockImplementation(async (id: string) =>
				id === "source" ? source : target,
			);
			mocks.findComposeById.mockResolvedValue(source);
			mocks.createApplication.mockResolvedValue(target);
			mocks.createCompose.mockResolvedValue(target);

			await duplicateService({
				id: "source",
				type,
				environmentId: "target-environment",
				targetServer,
				renameAsCopy: true,
			});
			return mocks.insertDomain.mock.results.map((result) => result.value);
		};

		it("copies custom domains disabled and preserves their routing and TLS settings", async () => {
			const [copied] = await duplicate([sourceDomain]);

			expect(copied).toMatchObject({
				host: "example.com",
				enabled: false,
				https: true,
				certificateType: "letsencrypt",
				path: "/api",
				port: 3000,
				internalPath: "/",
				stripPath: true,
				middlewares: ["compression"],
				domainType: type,
				applicationId: type === "application" ? "copy" : null,
				composeId: type === "compose" ? "copy" : null,
			});
			expect(mocks.manageDomain).not.toHaveBeenCalled();
			expect(mocks.findServerById).not.toHaveBeenCalled();
			expect(sourceDomain.enabled).toBe(true);
		});

		it("regenerates sslip.io hosts with the remote target IP", async () => {
			const [copied] = await duplicate([
				{ ...sourceDomain, host: "source-abcdef-203-0-113-10.sslip.io" },
			]);

			expect(copied?.host).toMatch(
				/^copy-app-abcdef-[a-f0-9]{6}-203-0-113-20\.sslip\.io$/,
			);
			expect(copied?.enabled).toBe(true);
			expect(mocks.findServerById).toHaveBeenCalledWith("server-2");
			if (type === "application") {
				expect(mocks.manageDomain).toHaveBeenCalledWith(
					expect.objectContaining({ serverId: "server-2" }),
					copied,
				);
			}
		});

		it("uses the Dokploy host IP for copies placed locally", async () => {
			const [copied] = await duplicate(
				[{ ...sourceDomain, host: "source-203-0-113-10.sslip.io" }],
				{ kind: "dokploy" },
			);

			expect(copied?.host).toMatch(/-203-0-113-30\.sslip\.io$/);
			expect(copied?.enabled).toBe(true);
			expect(mocks.findServerById).not.toHaveBeenCalled();
		});

		it("keeps domains disabled when the target IP is unavailable", async () => {
			mocks.getWebServerSettings.mockResolvedValue({ serverIp: "" });
			const [copied] = await duplicate(
				[{ ...sourceDomain, host: "source-203-0-113-10.sslip.io" }],
				{ kind: "dokploy" },
			);

			expect(copied?.host).toBe("source-203-0-113-10.sslip.io");
			expect(copied?.enabled).toBe(false);
			expect(mocks.manageDomain).not.toHaveBeenCalled();
		});

		it("shares a regenerated host across paths and preserves disabled domains", async () => {
			const host = "source-203-0-113-10.sslip.io";
			const copied = await duplicate([
				{ ...sourceDomain, host, path: "/" },
				{ ...sourceDomain, host, path: "/api", enabled: false },
				sourceDomain,
			]);

			expect(copied[0]?.host).toMatch(/-203-0-113-20\.sslip\.io$/);
			expect(copied[1]?.host).toBe(copied[0]?.host);
			expect(copied.map((domain) => domain.enabled)).toEqual([
				true,
				false,
				false,
			]);
			expect(copied.map((domain) => domain.path)).toEqual([
				"/",
				"/api",
				"/api",
			]);
		});

		it.each([
			{ target: { kind: "keep" }, source: "server-1" },
			{ target: { kind: "remote", serverId: "server-1" }, source: "server-1" },
			{ target: { kind: "dokploy" }, source: null },
		] satisfies { target: DuplicateTargetServer; source: string | null }[])(
			"preserves hosts and enabled state on the same server for $target.kind",
			async ({ target, source }) => {
				const copied = await duplicate(
					[
						sourceDomain,
						{
							...sourceDomain,
							host: "source-203-0-113-10.sslip.io",
							enabled: false,
						},
					],
					target,
					source,
				);

				expect(copied.map(({ host, enabled }) => ({ host, enabled }))).toEqual([
					{ host: "example.com", enabled: true },
					{ host: "source-203-0-113-10.sslip.io", enabled: false },
				]);
				expect(mocks.findServerById).not.toHaveBeenCalled();
				expect(mocks.getWebServerSettings).not.toHaveBeenCalled();
			},
		);
	},
);
