import { projects, projectTags, tags } from "@dokploy/server/db/schema";
import type {
	Plan,
	Snapshot,
	TransferWriteDb,
} from "@dokploy/server/services/project-export-import";
import { apply } from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

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
		project: {
			projectId: "project-src",
			name: "src",
			env: "",
			tags: [
				{ name: "prod", color: "#f00" },
				{ name: "billing", color: null },
			],
		},
		environments: [],
		services: [],
		shared: {},
	},
	requirements: [],
	warnings: [],
	dumps: [],
};

const plan: Plan = {
	target: { kind: "newProject", name: "imported" },
	resolutions: {},
	serverMap: {},
	appNameMap: {},
	domainStrategy: { custom: "keep" },
	portsStrategy: "keep",
	rotateDatabaseCredentials: false,
	conflicts: [],
	pendingServices: [],
	warnings: [],
	validation: [],
	summary: { counts: {}, domains: 0, dumps: 0 },
};

describe("apply project tags", () => {
	it("reuses an existing tag by name and creates the missing one", async () => {
		const inserted = new Map<unknown, Record<string, unknown>[]>();
		const writeDb = {
			query: {
				tags: {
					findFirst: async (args: {
						where: (f: unknown, o: unknown) => unknown;
					}) => {
						const captured: unknown[] = [];
						args.where(new Proxy({}, { get: (_t, prop) => String(prop) }), {
							and: (...v: unknown[]) => v,
							eq: (a: unknown, b: unknown) => captured.push([a, b]),
						});
						const nameArg = captured.find(
							(c) => (c as [unknown, unknown])[0] === "name",
						) as [unknown, string] | undefined;
						return nameArg?.[1] === "prod"
							? { tagId: "tag-existing", name: "prod" }
							: undefined;
					},
				},
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const row = { ...values };
					if (table === projects) row.projectId = "project-new";
					if (table === tags) row.tagId = "tag-new";
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

		await apply(writeDb, snapshot, plan, new Map(), "org-dest");

		expect(inserted.get(projects)?.[0]).not.toHaveProperty("tags");
		expect(inserted.get(tags)).toEqual([
			{
				name: "billing",
				color: null,
				organizationId: "org-dest",
				tagId: "tag-new",
			},
		]);
		expect(inserted.get(projectTags)).toEqual([
			{ projectId: "project-new", tagId: "tag-existing" },
			{ projectId: "project-new", tagId: "tag-new" },
		]);
	});
});
