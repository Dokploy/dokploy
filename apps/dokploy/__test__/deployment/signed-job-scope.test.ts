import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findPreviewDeploymentById: vi.fn(),
	findServerById: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	findApplicationById: mocks.findApplicationById,
	findComposeById: mocks.findComposeById,
	findPreviewDeploymentById: mocks.findPreviewDeploymentById,
	findServerById: mocks.findServerById,
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));

vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: mocks.findComposeById,
}));

vi.mock("@dokploy/server/services/preview-deployment", () => ({
	findPreviewDeploymentById: mocks.findPreviewDeploymentById,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

const {
	assertSignedDeploymentCancelJob,
	assertSignedDeploymentJobsReadRequest,
	assertSignedDeploymentQueueJob,
	signDeploymentCancelJob,
	signDeploymentJobsReadRequest,
	signDeploymentQueueJob,
} = await import("@dokploy/server/utils/deployments/signed-job");

describe("signed deployment job scope", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("API_KEY", "global-api-key");
		vi.stubEnv("DEPLOYMENTS_SIGNING_KEY", "deployment-signing-key");
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			serverId: "server-1",
			environment: {
				project: {
					organizationId: "org-1",
				},
			},
		});
		mocks.findComposeById.mockResolvedValue({
			composeId: "compose-1",
			serverId: "server-1",
			environment: {
				project: {
					organizationId: "org-1",
				},
			},
		});
		mocks.findPreviewDeploymentById.mockResolvedValue({
			previewDeploymentId: "preview-1",
			applicationId: "app-1",
			application: {
				serverId: "server-1",
			},
		});
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-1",
			serverStatus: "active",
		});
	});

	it("exports the deployment signer subpath from the server package", () => {
		const packageJson = JSON.parse(
			readFileSync(
				new URL("../../../../packages/server/package.json", import.meta.url),
				"utf8",
			),
		);

		const signedJobExport =
			packageJson.exports["./utils/deployments/signed-job"];

		expect([
			"./src/utils/deployments/signed-job.ts",
			"./dist/utils/deployments/signed-job.js",
		]).toContain(signedJobExport.import);
		expect(signedJobExport.require).toBe(
			"./dist/utils/deployments/signed-job.js",
		);
	});

	it("signs and verifies scoped application deployment jobs", async () => {
		const job = {
			applicationId: "app-1",
			applicationType: "application" as const,
			descriptionLog: "",
			server: true,
			serverId: "server-1",
			titleLog: "Manual deployment",
			type: "deploy" as const,
		};

		const signed = await signDeploymentQueueJob(job, {
			operation: "deploy",
			now: 1000,
			ttlMs: 60_000,
		});

		expect(signed.scope).toMatchObject({
			operation: "deploy",
			applicationType: "application",
			objectId: "app-1",
			applicationId: "app-1",
			deploymentType: "deploy",
			serverId: "server-1",
			organizationId: "org-1",
			expiresAt: 61_000,
			nonce: expect.any(String),
		});
		await expect(
			assertSignedDeploymentQueueJob(signed, {
				operation: "deploy",
				now: 2000,
			}),
		).resolves.toEqual(job);
	});

	it("rejects deployment jobs when the scoped object id is tampered", async () => {
		const signed = await signDeploymentQueueJob(
			{
				applicationId: "app-1",
				applicationType: "application",
				descriptionLog: "",
				server: true,
				serverId: "server-1",
				titleLog: "Manual deployment",
				type: "deploy",
			},
			{ operation: "deploy", now: 1000 },
		);

		await expect(
			assertSignedDeploymentQueueJob(
				{
					applicationId: "app-2",
					applicationType: "application",
					descriptionLog: signed.descriptionLog,
					server: signed.server,
					serverId: signed.serverId,
					titleLog: signed.titleLog,
					type: signed.type,
					scope: signed.scope,
					signature: signed.signature,
				},
				{ operation: "deploy", now: 2000 },
			),
		).rejects.toThrow(/object id/i);
	});

	it("uses a unique nonce for identical deployment jobs", async () => {
		const job = {
			applicationId: "app-1",
			applicationType: "application" as const,
			descriptionLog: "",
			server: true,
			serverId: "server-1",
			titleLog: "Manual deployment",
			type: "deploy" as const,
		};

		const first = await signDeploymentQueueJob(job, {
			operation: "deploy",
			now: 1000,
		});
		const second = await signDeploymentQueueJob(job, {
			operation: "deploy",
			now: 1000,
		});

		expect(first.scope.nonce).not.toEqual(second.scope.nonce);
		expect(first.signature).not.toEqual(second.signature);
	});

	it("rejects signed deployment jobs reused for cancellation", async () => {
		const signed = await signDeploymentQueueJob(
			{
				applicationId: "app-1",
				applicationType: "application",
				descriptionLog: "",
				server: true,
				serverId: "server-1",
				titleLog: "Manual deployment",
				type: "deploy",
			},
			{ operation: "deploy", now: 1000 },
		);

		await expect(
			assertSignedDeploymentCancelJob(
				{
					applicationId: "app-1",
					applicationType: "application",
					scope: signed.scope,
					signature: signed.signature,
				},
				{
					operation: "cancel",
					now: 2000,
					requireFreshScope: false,
				},
			),
		).rejects.toThrow(/operation/i);
	});

	it("rejects deployment jobs when the current database scope changed", async () => {
		const signed = await signDeploymentQueueJob(
			{
				composeId: "compose-1",
				applicationType: "compose",
				descriptionLog: "",
				server: true,
				serverId: "server-1",
				titleLog: "Manual deployment",
				type: "deploy",
			},
			{ operation: "deploy", now: 1000 },
		);
		mocks.findComposeById.mockResolvedValue({
			composeId: "compose-1",
			serverId: "server-1",
			environment: {
				project: {
					organizationId: "org-2",
				},
			},
		});

		await expect(
			assertSignedDeploymentQueueJob(signed, {
				operation: "deploy",
				now: 2000,
			}),
		).rejects.toThrow(/organization scope/i);
	});

	it("falls back to a derived API key signing key for legacy installs", async () => {
		vi.stubEnv("DEPLOYMENTS_SIGNING_KEY", "");

		const signed = await signDeploymentQueueJob(
			{
				applicationId: "app-1",
				applicationType: "application",
				descriptionLog: "",
				server: true,
				serverId: "server-1",
				titleLog: "Manual deployment",
				type: "deploy",
			},
			{ operation: "deploy", now: 1000 },
		);

		await expect(
			assertSignedDeploymentQueueJob(signed, {
				operation: "deploy",
				now: 2000,
			}),
		).resolves.toMatchObject({
			applicationId: "app-1",
			applicationType: "application",
			type: "deploy",
		});
	});

	it("fails closed without a deployment signing key or API key fallback", async () => {
		vi.stubEnv("DEPLOYMENTS_SIGNING_KEY", "");
		vi.stubEnv("API_KEY", "");

		await expect(
			signDeploymentQueueJob(
				{
					applicationId: "app-1",
					applicationType: "application",
					descriptionLog: "",
					server: true,
					serverId: "server-1",
					titleLog: "Manual deployment",
					type: "deploy",
				},
				{ operation: "deploy" },
			),
		).rejects.toThrow(/signing key is not configured/i);

		vi.stubEnv("DEPLOYMENTS_SIGNING_KEY", "global-api-key");
		vi.stubEnv("API_KEY", "global-api-key");
		await expect(
			signDeploymentCancelJob(
				{
					applicationId: "app-1",
					applicationType: "application",
				},
				{ operation: "cancel", requireActiveServer: false },
			),
		).rejects.toThrow(/must differ from the API key/i);
	});

	it("signs and verifies cancel jobs with object scope", async () => {
		const job = {
			composeId: "compose-1",
			applicationType: "compose" as const,
		};
		const signed = await signDeploymentCancelJob(job, {
			operation: "cancel",
			now: 1000,
			requireActiveServer: false,
		});

		expect(signed.scope).toMatchObject({
			operation: "cancel",
			applicationType: "compose",
			objectId: "compose-1",
			applicationId: null,
			deploymentType: null,
			serverId: "server-1",
			organizationId: "org-1",
			nonce: expect.any(String),
		});
		await expect(
			assertSignedDeploymentCancelJob(signed, {
				operation: "cancel",
				now: 2000,
			}),
		).resolves.toEqual(job);
	});

	it("allows cancel job verification when the assigned server is inactive", async () => {
		const job = {
			applicationId: "app-1",
			applicationType: "application" as const,
		};
		const signed = await signDeploymentCancelJob(job, {
			operation: "cancel",
			now: 1000,
			requireActiveServer: false,
		});
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-1",
			serverStatus: "inactive",
		});

		await expect(
			assertSignedDeploymentCancelJob(signed, {
				operation: "cancel",
				now: 2000,
			}),
		).rejects.toThrow(/server is inactive/i);
		await expect(
			assertSignedDeploymentCancelJob(signed, {
				operation: "cancel",
				now: 2000,
				requireActiveServer: false,
			}),
		).resolves.toEqual(job);
	});

	it("signs deployment job read requests with server and organization scope", async () => {
		const signed = await signDeploymentJobsReadRequest("server-1", {
			now: 1000,
			ttlMs: 60_000,
		});

		expect(signed.scope).toMatchObject({
			operation: "read-jobs",
			serverId: "server-1",
			organizationId: "org-1",
			expiresAt: 61_000,
			nonce: expect.any(String),
		});
		await expect(
			assertSignedDeploymentJobsReadRequest(signed, {
				now: 2000,
			}),
		).resolves.toBe("server-1");
	});

	it("rejects deployment job read requests when the server id is tampered", async () => {
		const signed = await signDeploymentJobsReadRequest("server-1", {
			now: 1000,
		});

		await expect(
			assertSignedDeploymentJobsReadRequest(
				{
					...signed,
					serverId: "server-2",
				},
				{ now: 2000 },
			),
		).rejects.toThrow(/server scope/i);
	});
});
