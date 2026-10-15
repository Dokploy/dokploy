import type {
	Conflict,
	Plan,
	Snapshot,
	TransferWriteDb,
} from "@dokploy/server/services/project-export-import";
import {
	apply,
	resolveConflicts,
	resolvedProjectName,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const conflict = (
	kind: Conflict["kind"],
	value: string,
	options: Conflict["options"],
): Conflict => ({
	kind,
	value,
	existingId: `existing-${kind}`,
	usedBy: [],
	options,
});

describe("resolveConflicts", () => {
	const conflicts = [
		conflict("domain", "api.example.com", ["rename", "skip"]),
		conflict("port", "8080", ["rename", "skip", "keep"]),
		conflict("projectName", "shop", ["rename"]),
		conflict("network", "shared-net", ["keep", "rename", "skip"]),
	];

	it("applies safe defaults per kind", () => {
		expect(resolveConflicts(conflicts, undefined)).toEqual({
			"domain:api.example.com": { action: "skip" },
			"port:8080": { action: "skip" },
			"projectName:shop": { action: "rename", value: "shop (imported)" },
			"network:shared-net": { action: "keep" },
		});
	});

	it("keeps valid user choices and falls back for invalid ones", () => {
		const resolved = resolveConflicts(conflicts, {
			"domain:api.example.com": { action: "rename", value: "api2.example.com" },
			"port:8080": { action: "rename", value: "not-a-port" },
			"projectName:shop": { action: "skip" },
			"network:shared-net": { action: "rename", value: "shared-net-2" },
		});
		expect(resolved["domain:api.example.com"]).toEqual({
			action: "rename",
			value: "api2.example.com",
		});
		expect(resolved["port:8080"]).toEqual({ action: "skip" });
		expect(resolved["projectName:shop"]).toEqual({
			action: "rename",
			value: "shop (imported)",
		});
		expect(resolved["network:shared-net"]).toEqual({
			action: "rename",
			value: "shared-net-2",
		});
	});

	it("resolves the project name from the rename choice", () => {
		expect(
			resolvedProjectName(
				{ kind: "newProject", name: "shop" },
				{ "projectName:shop": { action: "rename", value: " shop-2 " } },
			),
		).toBe("shop-2");
		expect(resolvedProjectName({ kind: "newProject", name: "shop" }, {})).toBe(
			"shop",
		);
	});
});

const snapshot: Snapshot = {
	manifest: {
		format: "dokploy-project-export",
		formatVersion: 1,
		exportedAt: "2024-01-01T00:00:00.000Z",
		exportedBy: { userId: "user-1", email: "a@b.com" },
		sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
		scope: {
			includeEnvSecrets: true,
			shared: {},
			files: {
				applicationSources: true,
				composeFiles: true,
				traefikRaw: true,
				customCertificates: true,
			},
			dumps: { mode: "none" },
			includeBackupSchedules: true,
		},
		crypto: {
			salt: "c2FsdA==",
			kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
			keyCheck: "{}",
		},
		counts: {},
	},
	resources: {
		project: { projectId: "project-src", name: "shop", env: "" },
		environments: [{ environmentId: "env-1", name: "production", env: "" }],
		services: [
			{
				kind: "application",
				applicationId: "app-1",
				appName: "web-abc123",
				environmentId: "env-1",
				networkIds: ["net-src"],
				domains: [
					{ domainId: "dom-1", host: "api.example.com", enabled: true },
					{ domainId: "dom-2", host: "admin.example.com", enabled: true },
				],
				ports: [
					{ portId: "p-1", publishedPort: 8080, targetPort: 80 },
					{ portId: "p-2", publishedPort: 9090, targetPort: 90 },
					{ portId: "p-3", publishedPort: 7070, targetPort: 70 },
				],
			},
		],
		shared: {
			network: [{ networkId: "net-src", name: "shared-net", serverId: null }],
		},
	},
	requirements: [
		{
			kind: "network",
			originalId: "net-src",
			configIncluded: true,
			usedBy: [],
			name: "shared-net",
		},
	],
	warnings: [],
	dumps: [],
};

const runApply = async (
	conflictResolutions: Plan["conflictResolutions"],
	networkResolution: "keep" | "rename" | "skip",
) => {
	const { applications, domains, environments, network, ports, projects } =
		await import("@dokploy/server/db/schema");
	const inserted = new Map<unknown, Record<string, unknown>[]>();
	let counter = 0;
	const writeDb = {
		query: {
			server: { findFirst: async () => undefined },
			webServerSettings: { findFirst: async () => undefined },
			mounts: { findMany: async () => [] },
			github: { findFirst: async () => undefined },
			gitlab: { findFirst: async () => undefined },
			gitea: { findFirst: async () => undefined },
			bitbucket: { findFirst: async () => undefined },
		},
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				const row: Record<string, unknown> = {
					...values,
					id: `row-${++counter}`,
				};
				if (table === projects) row.projectId = "project-new";
				if (table === environments) row.environmentId = "env-new";
				if (table === network) row.networkId = "net-new";
				if (table === applications) row.applicationId = "app-new";
				if (table === domains) row.domainId = `dom-new-${counter}`;
				const list = inserted.get(table) ?? [];
				list.push(row);
				inserted.set(table, list);
				return { returning: async () => [row] };
			},
		}),
		update: () => ({ set: () => ({ where: async () => {} }) }),
		transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({ ...writeDb }),
	} as unknown as TransferWriteDb;

	const plan: Plan = {
		target: { kind: "newProject", name: "shop" },
		resolutions: {
			"network:net-src": {
				requirementKey: "network:net-src",
				action: "create",
			},
		},
		serverMap: { null: null },
		appNameMap: { "web-abc123": "web-xyz789" },
		domainStrategy: { custom: "keep" },
		portsStrategy: "keep",
		rotateDatabaseCredentials: false,
		conflicts: [
			conflict("projectName", "shop", ["rename"]),
			conflict("domain", "api.example.com", ["rename", "skip"]),
			conflict("domain", "admin.example.com", ["rename", "skip"]),
			conflict("port", "8080", ["rename", "skip", "keep"]),
			conflict("port", "9090", ["rename", "skip", "keep"]),
			conflict("network", "shared-net", ["keep", "rename", "skip"]),
		],
		conflictResolutions: {
			...conflictResolutions,
			"network:shared-net":
				networkResolution === "rename"
					? { action: "rename", value: "shared-net-2" }
					: { action: networkResolution },
		},
		pendingServices: [],
		warnings: [],
		validation: [],
		summary: { counts: {}, domains: 2, dumps: 0 },
	};

	const result = await apply(writeDb, snapshot, plan, new Map(), "org-dest");
	return {
		result,
		project: inserted.get(projects)?.[0],
		domains: inserted.get(domains) ?? [],
		ports: inserted.get(ports) ?? [],
		networks: inserted.get(network) ?? [],
		application: inserted.get(applications)?.[0],
	};
};

describe("apply consumes conflict resolutions", () => {
	it("renames the project and domains, drops skipped ports, renames a port, reuses the existing network", async () => {
		const out = await runApply(
			{
				"projectName:shop": { action: "rename", value: "shop-2" },
				"domain:api.example.com": {
					action: "rename",
					value: "api-2.example.com",
				},
				"domain:admin.example.com": { action: "skip" },
				"port:8080": { action: "skip" },
				"port:9090": { action: "rename", value: "9091" },
			},
			"keep",
		);
		expect(out.project?.name).toBe("shop-2");
		expect(out.domains.map((d) => [d.host, d.enabled])).toEqual([
			["api-2.example.com", true],
			["admin.example.com", false],
		]);
		expect(out.ports.map((p) => p.publishedPort)).toEqual([9091, 7070]);
		expect(out.networks).toEqual([]);
		expect(out.application?.networkIds).toEqual(["existing-network"]);
		expect(out.result.idMap.network).toEqual({ "net-src": "existing-network" });
	});

	it("creates the network under a new name when renamed, and drops it when skipped", async () => {
		const renamed = await runApply({}, "rename");
		expect(renamed.networks.map((n) => n.name)).toEqual(["shared-net-2"]);
		expect(renamed.application?.networkIds).toEqual(["net-new"]);

		const skipped = await runApply({}, "skip");
		expect(skipped.networks).toEqual([]);
		expect(skipped.application?.networkIds).toEqual([]);
		expect(
			skipped.result.warnings.some((w) => w.code === "NETWORK_UNRESOLVED"),
		).toBe(true);
	});
});
