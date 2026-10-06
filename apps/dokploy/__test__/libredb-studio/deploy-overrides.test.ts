import path from "node:path";
import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { generateConfigContainer } from "@dokploy/server/utils/docker/utils";
import {
	applyLibreDBStudioDeployOverrides,
	getLibreDBStudioDeployOverrides,
	type LibreDBStudioDeployOverrides,
} from "@dokploy/server/utils/libredb-studio/deploy";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	runLibreDBStudioSync: vi.fn(),
	getRemoteDocker: vi.fn(),
	info: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { libredbStudio: { findFirst: mocks.findFirst } } },
}));

vi.mock("@dokploy/server/utils/libredb-studio/sync", () => ({
	runLibreDBStudioSync: mocks.runLibreDBStudioSync,
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

const studioRow = {
	libredbStudioId: "studio-1",
	applicationId: "app-1",
	allowCustomConnections: false,
	seedHash: null,
	lastSyncedAt: null,
	lastSyncError: null,
	launchSecret: "0123456789abcdef".repeat(4),
	jwtSecret: "J".repeat(64),
	adminPassword: "P".repeat(24),
	createdAt: "2026-10-03T12:00:00.000Z",
	application: { appName: "demo-shop-libredb-studio-abc123" },
};

const remoteStudio = {
	applicationId: "app-1",
	appName: "demo-shop-libredb-studio-abc123",
	serverId: "server-1",
};

const TYPED_INTO_ENV_TAB = "typed-into-the-env-tab";

const SECRETS_NOT_DECRYPTED =
	"The LibreDB Studio secrets cannot be decrypted with the current Dokploy encryption key. Restore the ENCRYPTION_KEY or BETTER_AUTH_SECRET that encrypted them, or remove this Studio and install it again.";

const overrides: LibreDBStudioDeployOverrides = {
	mounts: [
		{
			Type: "bind",
			Source: "/etc/dokploy/applications/studio/libredb-studio/seed",
			Target: "/app/config",
			ReadOnly: true,
		},
	],
	env: [
		"SEED_CONFIG_PATH=/app/config/seed-connections.json",
		"SEED_CACHE_TTL_MS=5000",
		"ALLOW_CUSTOM_CONNECTIONS=false",
		"SEED_LITERAL_VALUES=true",
		`LAUNCH_TOKEN_SECRET=${studioRow.launchSecret}`,
		"LAUNCH_TOKEN_AUDIENCE=studio-1",
		"LAUNCH_TOKEN_ISSUER=dokploy",
		`JWT_SECRET=${studioRow.jwtSecret}`,
		`ADMIN_PASSWORD=${studioRow.adminPassword}`,
	],
	placementConstraint: "node.id==node-abc",
};

const placementFor = (application: Partial<ApplicationNested>) =>
	generateConfigContainer(application).Placement;

const volumeMount = {
	type: "volume",
	volumeName: "studio-data",
	mountPath: "/app/data",
} as unknown as ApplicationNested["mounts"][number];

const deepFreeze = <T>(value: T): T => {
	if (value && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
};

describe("getLibreDBStudioDeployOverrides", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findFirst.mockResolvedValue(studioRow);
		mocks.runLibreDBStudioSync.mockResolvedValue({ changed: true });
		mocks.info.mockResolvedValue({ Swarm: { NodeID: "node-abc" } });
		mocks.getRemoteDocker.mockResolvedValue({ info: mocks.info });
	});

	it("returns null for an application that is not a Studio", async () => {
		mocks.findFirst.mockResolvedValue(undefined);

		await expect(
			getLibreDBStudioDeployOverrides(remoteStudio),
		).resolves.toBeNull();

		expect(mocks.runLibreDBStudioSync).not.toHaveBeenCalled();
		expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
	});

	it("looks the Studio up by application id", async () => {
		await getLibreDBStudioDeployOverrides(remoteStudio);

		const [query] = mocks.findFirst.mock.calls[0] ?? [];
		expect(new PgDialect().sqlToQuery(query.where)).toMatchObject({
			sql: '"libredb_studio"."applicationId" = $1',
			params: ["app-1"],
		});
		expect(query.with).toEqual({
			application: { columns: { appName: true } },
		});
	});

	it("refuses a preview deployment of the Studio application", async () => {
		await expect(
			getLibreDBStudioDeployOverrides({
				...remoteStudio,
				appName: "preview-demo-shop-libredb-studio-abc123-k3j4h5",
			}),
		).rejects.toThrow("LibreDB Studio does not support preview deployments");

		expect(mocks.runLibreDBStudioSync).not.toHaveBeenCalled();
		expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
	});

	it.each(["launchSecret", "jwtSecret", "adminPassword"] as const)(
		"refuses to deploy a Studio whose %s could not be decrypted",
		async (column) => {
			mocks.findFirst.mockResolvedValue({
				...studioRow,
				[column]: "enc:v1:c3RpbGwgZW5jcnlwdGVk",
			});

			await expect(
				getLibreDBStudioDeployOverrides(remoteStudio),
			).rejects.toThrow(SECRETS_NOT_DECRYPTED);
			expect(mocks.runLibreDBStudioSync).not.toHaveBeenCalled();
			expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
		},
	);

	it("forces a seed write before the service is deployed", async () => {
		await getLibreDBStudioDeployOverrides(remoteStudio);

		expect(mocks.runLibreDBStudioSync).toHaveBeenCalledWith("studio-1", {
			force: true,
		});
		const [syncOrder] = mocks.runLibreDBStudioSync.mock.invocationCallOrder;
		const [infoOrder] = mocks.info.mock.invocationCallOrder;
		expect(syncOrder).toBeLessThan(infoOrder as number);
	});

	it("bind-mounts the seed directory read-only at /app/config", async () => {
		const result = await getLibreDBStudioDeployOverrides(remoteStudio);

		expect(result?.mounts).toEqual([
			{
				Type: "bind",
				Source:
					"/etc/dokploy/applications/demo-shop-libredb-studio-abc123/libredb-studio/seed",
				Target: "/app/config",
				ReadOnly: true,
			},
		]);
	});

	it("uses the local applications path for a Studio on the Dokploy host", async () => {
		const result = await getLibreDBStudioDeployOverrides({
			...remoteStudio,
			serverId: null,
		});

		expect(mocks.getRemoteDocker).toHaveBeenCalledWith(null);
		expect(result?.mounts[0]?.Source).toBe(
			path.join(
				process.cwd(),
				".docker",
				"applications",
				"demo-shop-libredb-studio-abc123",
				"libredb-studio",
				"seed",
			),
		);
	});

	it("injects the integration env with the secrets of the Studio row", async () => {
		const result = await getLibreDBStudioDeployOverrides(remoteStudio);

		expect(result?.env).toEqual([
			"SEED_CONFIG_PATH=/app/config/seed-connections.json",
			"SEED_CACHE_TTL_MS=5000",
			"ALLOW_CUSTOM_CONNECTIONS=false",
			"SEED_LITERAL_VALUES=true",
			`LAUNCH_TOKEN_SECRET=${studioRow.launchSecret}`,
			"LAUNCH_TOKEN_AUDIENCE=studio-1",
			"LAUNCH_TOKEN_ISSUER=dokploy",
			`JWT_SECRET=${studioRow.jwtSecret}`,
			`ADMIN_PASSWORD=${studioRow.adminPassword}`,
		]);
	});

	it("injects the secrets and audience of the Studio being deployed", async () => {
		const otherStudio = {
			...studioRow,
			libredbStudioId: "studio-2",
			launchSecret: "fedcba9876543210".repeat(4),
			jwtSecret: "K".repeat(64),
			adminPassword: "Q".repeat(24),
		};
		mocks.findFirst.mockResolvedValue(otherStudio);

		const result = await getLibreDBStudioDeployOverrides(remoteStudio);

		expect(result?.env).toEqual([
			"SEED_CONFIG_PATH=/app/config/seed-connections.json",
			"SEED_CACHE_TTL_MS=5000",
			"ALLOW_CUSTOM_CONNECTIONS=false",
			"SEED_LITERAL_VALUES=true",
			`LAUNCH_TOKEN_SECRET=${otherStudio.launchSecret}`,
			"LAUNCH_TOKEN_AUDIENCE=studio-2",
			"LAUNCH_TOKEN_ISSUER=dokploy",
			`JWT_SECRET=${otherStudio.jwtSecret}`,
			`ADMIN_PASSWORD=${otherStudio.adminPassword}`,
		]);
		expect(mocks.runLibreDBStudioSync).toHaveBeenCalledWith("studio-2", {
			force: true,
		});
	});

	it("takes ALLOW_CUSTOM_CONNECTIONS from the Studio row", async () => {
		mocks.findFirst.mockResolvedValue({
			...studioRow,
			allowCustomConnections: true,
		});

		const result = await getLibreDBStudioDeployOverrides(remoteStudio);

		expect(result?.env).toContain("ALLOW_CUSTOM_CONNECTIONS=true");
		expect(result?.env).not.toContain("ALLOW_CUSTOM_CONNECTIONS=false");
	});

	it("pins the service to the swarm node that holds the seed directory", async () => {
		const result = await getLibreDBStudioDeployOverrides(remoteStudio);

		expect(mocks.getRemoteDocker).toHaveBeenCalledWith("server-1");
		expect(result?.placementConstraint).toBe("node.id==node-abc");
	});

	it("fails when the Docker host has no swarm node id", async () => {
		mocks.info.mockResolvedValue({ Swarm: { NodeID: "" } });

		await expect(getLibreDBStudioDeployOverrides(remoteStudio)).rejects.toThrow(
			"Cannot deploy LibreDB Studio demo-shop-libredb-studio-abc123: Docker reports no Swarm node id for the host that holds its seed directory",
		);
	});

	it("fails when docker info has no swarm section", async () => {
		mocks.info.mockResolvedValue({});

		await expect(getLibreDBStudioDeployOverrides(remoteStudio)).rejects.toThrow(
			"Docker reports no Swarm node id",
		);
	});

	it("fails without touching Docker when the seed sync fails", async () => {
		const failure = new Error("Seed validation failed: duplicate id");
		mocks.runLibreDBStudioSync.mockRejectedValue(failure);

		const error = await getLibreDBStudioDeployOverrides(remoteStudio).catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(
			"LibreDB Studio seed sync failed: Seed validation failed: duplicate id",
		);
		expect((error as Error).cause).toBe(failure);
		expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
	});

	it("keeps the remote command details of a failed seed write for the deployment log", async () => {
		mocks.runLibreDBStudioSync.mockRejectedValue(
			new ExecError("Remote command failed with exit code 1", {
				command:
					"chmod 644 /etc/dokploy/applications/demo/libredb-studio/seed/.seed-connections.json.0011223344556677.tmp",
				stderr: "chmod: Operation not permitted",
				exitCode: 1,
				serverId: "server-1",
			}),
		);

		const error = await getLibreDBStudioDeployOverrides(remoteStudio).catch(
			(caught: unknown) => caught,
		);

		expect(error).not.toBeInstanceOf(ExecError);
		expect((error as Error).message).toContain(
			"LibreDB Studio seed sync failed: Remote command failed with exit code 1",
		);
		expect((error as Error).message).toContain("Exit Code: 1");
		expect((error as Error).message).toContain("Server ID: server-1");
		expect((error as Error).message).toContain(
			"Stderr: chmod: Operation not permitted",
		);
	});
});

describe("applyLibreDBStudioDeployOverrides", () => {
	const spec = {
		env: [
			"ADMIN_EMAIL=owner@example.com",
			"ALLOW_CUSTOM_CONNECTIONS=true",
			`JWT_SECRET=${TYPED_INTO_ENV_TAB}`,
			`ADMIN_PASSWORD=${TYPED_INTO_ENV_TAB}`,
			`LAUNCH_TOKEN_SECRET=${TYPED_INTO_ENV_TAB}`,
		],
		mounts: [
			{ Type: "volume" as const, Source: "studio-data", Target: "/app/data" },
		],
		placement: { Constraints: ["node.role==manager"] },
	};

	it("returns the spec unchanged for an application that is not a Studio", () => {
		expect(applyLibreDBStudioDeployOverrides(spec, null)).toBe(spec);
	});

	it("replaces user env entries, typed secrets included, with the injected ones", () => {
		const result = applyLibreDBStudioDeployOverrides(spec, overrides);

		expect(result.env).toEqual([
			"ADMIN_EMAIL=owner@example.com",
			...overrides.env,
		]);
		expect(result.env.join("\n")).not.toContain(TYPED_INTO_ENV_TAB);
	});

	it("appends the seed bind mount after the existing mounts", () => {
		const result = applyLibreDBStudioDeployOverrides(spec, overrides);

		expect(result.mounts).toEqual([
			{ Type: "volume", Source: "studio-data", Target: "/app/data" },
			{
				Type: "bind",
				Source: "/etc/dokploy/applications/studio/libredb-studio/seed",
				Target: "/app/config",
				ReadOnly: true,
			},
		]);
	});

	it("adds the constraint when there is no placementSwarm and no mount", () => {
		const placement = placementFor({ placementSwarm: null, mounts: [] });

		const result = applyLibreDBStudioDeployOverrides(
			{ ...spec, placement },
			overrides,
		);

		expect(placement).toEqual({ Constraints: [] });
		expect(result.placement).toEqual({ Constraints: ["node.id==node-abc"] });
	});

	it("keeps the default manager constraint next to the node constraint", () => {
		const placement = placementFor({
			placementSwarm: null,
			mounts: [volumeMount],
		});

		const result = applyLibreDBStudioDeployOverrides(
			{ ...spec, placement },
			overrides,
		);

		expect(placement).toEqual({ Constraints: ["node.role==manager"] });
		expect(result.placement).toEqual({
			Constraints: ["node.role==manager", "node.id==node-abc"],
		});
	});

	it("adds the constraint to a user placementSwarm without Constraints", () => {
		const placement = placementFor({
			placementSwarm: {
				Preferences: [{ Spread: { SpreadDescriptor: "node.labels.zone" } }],
				MaxReplicas: 1,
			},
			mounts: [volumeMount],
		});

		const result = applyLibreDBStudioDeployOverrides(
			{ ...spec, placement },
			overrides,
		);

		expect(result.placement).toEqual({
			Preferences: [{ Spread: { SpreadDescriptor: "node.labels.zone" } }],
			MaxReplicas: 1,
			Constraints: ["node.id==node-abc"],
		});
	});

	it("appends the constraint to the user's own Constraints", () => {
		const placement = placementFor({
			placementSwarm: {
				Constraints: ["node.labels.region==eu"],
				Platforms: [{ Architecture: "amd64", OS: "linux" }],
			},
			mounts: [volumeMount],
		});

		const result = applyLibreDBStudioDeployOverrides(
			{ ...spec, placement },
			overrides,
		);

		expect(result.placement).toEqual({
			Constraints: ["node.labels.region==eu", "node.id==node-abc"],
			Platforms: [{ Architecture: "amd64", OS: "linux" }],
		});
	});

	it("adds the constraint when no placement is given", () => {
		const result = applyLibreDBStudioDeployOverrides(
			{ ...spec, placement: undefined },
			overrides,
		);

		expect(result.placement).toEqual({ Constraints: ["node.id==node-abc"] });
	});

	it("does not mutate its inputs", () => {
		const frozenSpec = deepFreeze({
			env: ["ALLOW_CUSTOM_CONNECTIONS=true"],
			mounts: [
				{ Type: "volume" as const, Source: "data", Target: "/app/data" },
			],
			placement: { Constraints: ["node.labels.region==eu"] },
		});
		const frozenOverrides = deepFreeze(structuredClone(overrides));

		const result = applyLibreDBStudioDeployOverrides(
			frozenSpec,
			frozenOverrides,
		);

		expect(result.placement?.Constraints).toEqual([
			"node.labels.region==eu",
			"node.id==node-abc",
		]);
		expect(frozenSpec.placement.Constraints).toEqual([
			"node.labels.region==eu",
		]);
		expect(frozenSpec.mounts).toHaveLength(1);
	});
});
