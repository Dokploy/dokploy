import { describe, expect, it, vi } from "vitest";

const local = (path: string) => ({ serverId: null, path });

vi.mock("@/server/utils/billing", () => ({
	getCurrentPlan: vi.fn(async () => null),
}));

vi.mock(
	"@dokploy/server/services/project-export-import",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/services/project-export-import")
			>();
		return {
			...actual,
			assertTransferPermission: vi.fn(async () => ({ role: "owner" })),
			validatePlan: vi.fn(async () => []),
			inspectBundle: vi.fn(async () => {
				throw new Error("inspectBundle not stubbed for this test");
			}),
		};
	},
);

const {
	createImportJob,
	getImportJob,
	createExportJob,
	exportScopeSchema,
	assertTransferPermission,
	validatePlan,
	updateImportJob,
	inspectBundle,
	UnsupportedBundleVersionError,
} = await import("@dokploy/server/services/project-export-import");
const { projectExportImportRouter } = await import(
	"../../server/api/routers/project-export-import"
);

const ctxFor = (organizationId: string, userId = "user-1") =>
	({
		session: { activeOrganizationId: organizationId },
		user: { id: userId, email: "a@b.com" },
	}) as any;

describe("projectExportImportRouter.importStart", () => {
	it("rejects with BAD_REQUEST when importPlan hasn't run yet, after checking permission", async () => {
		const importId = "import-router-1";
		createImportJob(importId, "user-1", "org-1");
		const callCountBefore = (assertTransferPermission as any).mock.calls.length;

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(caller.importStart({ importId })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		expect((assertTransferPermission as any).mock.calls.length).toBeGreaterThan(
			callCountBefore,
		);
	});

	it("returns NOT_FOUND for a job belonging to another organization", async () => {
		const importId = "import-router-3";
		createImportJob(importId, "user-1", "org-2");

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(caller.importStart({ importId })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("calls validatePlan and rejects with BAD_REQUEST when a check fails", async () => {
		const userId = "user-validate-a";
		const importId = "import-router-validate-1";
		createImportJob(importId, userId, "org-1");
		updateImportJob(importId, {
			status: "planned",
			snapshot: { resources: { services: [] } } as any,
			plan: {
				serverMap: {},
				target: { kind: "newProject", name: "imported" },
			} as any,
		});

		(validatePlan as any).mockResolvedValueOnce([
			{ check: "appName:taken-name", ok: false, detail: "Already in use" },
		]);

		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", userId),
		);
		await expect(caller.importStart({ importId })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(validatePlan).toHaveBeenCalled();
	});

	it("proceeds past validation when every check passes", async () => {
		const userId = "user-validate-b";
		const importId = "import-router-validate-2";
		createImportJob(importId, userId, "org-1");
		updateImportJob(importId, {
			status: "planned",
			snapshot: { resources: { services: [] } } as any,
			plan: {
				serverMap: {},
				target: { kind: "newProject", name: "imported" },
			} as any,
		});

		(validatePlan as any).mockResolvedValueOnce([
			{ check: "appName:free-name", ok: true },
		]);

		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", userId),
		);
		const result = await caller.importStart({ importId });
		expect(result).toEqual({ success: true });
	});

	it("rejects with CONFLICT when the user already has a different transfer active", async () => {
		const userId = "user-validate-c";
		const busyImportId = "import-router-busy-1";
		createImportJob(busyImportId, userId, "org-1");

		const importId = "import-router-validate-3";
		createImportJob(importId, userId, "org-1");
		updateImportJob(importId, {
			status: "planned",
			snapshot: { resources: { services: [] } } as any,
			plan: {
				serverMap: {},
				target: { kind: "newProject", name: "imported" },
			} as any,
		});
		(validatePlan as any).mockResolvedValueOnce([
			{ check: "appName:free-name", ok: true },
		]);

		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", userId),
		);
		await expect(caller.importStart({ importId })).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});

	it("does not treat the job's own already-active status as a conflict with itself", async () => {
		const userId = "user-validate-d";
		const importId = "import-router-validate-4";
		createImportJob(importId, userId, "org-1");
		updateImportJob(importId, {
			status: "planned",
			snapshot: { resources: { services: [] } } as any,
			plan: {
				serverMap: {},
				target: { kind: "newProject", name: "imported" },
			} as any,
		});
		(validatePlan as any).mockResolvedValueOnce([
			{ check: "appName:free-name", ok: true },
		]);

		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", userId),
		);
		const result = await caller.importStart({ importId });
		expect(result).toEqual({ success: true });
	});

	it("re-checks target.projectId's org via assertTransferPermission for an existingProject target", async () => {
		const userId = "user-validate-e";
		const importId = "import-router-validate-5";
		createImportJob(importId, userId, "org-1");
		updateImportJob(importId, {
			status: "planned",
			snapshot: { resources: { services: [] } } as any,
			plan: {
				serverMap: {},
				target: {
					kind: "existingProject",
					projectId: "project-other-org",
					environmentName: "imported",
				},
			} as any,
		});
		(validatePlan as any).mockResolvedValueOnce([
			{ check: "appName:free-name", ok: true },
		]);

		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", userId),
		);
		await caller.importStart({ importId }).catch(() => {});

		const lastCall = (assertTransferPermission as any).mock.calls.at(-1);
		expect(lastCall[1]).toBe("project-other-org");
	});
});

describe("projectExportImportRouter.importInspect (T-6.20)", () => {
	it("maps UnsupportedBundleVersionError to BAD_REQUEST with its guidance message", async () => {
		const importId = "import-router-inspect-1";
		createImportJob(importId, "user-1", "org-1");
		updateImportJob(importId, {
			root: local("/tmp/does-not-matter"),
			bundle: local("/tmp/does-not-matter.tar.gz"),
		});

		(inspectBundle as any).mockRejectedValueOnce(
			new UnsupportedBundleVersionError(2, 1),
		);

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(caller.importInspect({ importId })).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("newer version of Dokploy"),
		});
	});
});

describe("projectExportImportRouter guards", () => {
	it("refuses to start an import that is not in the planned state", async () => {
		const importId = "import-router-not-planned";
		createImportJob(importId, "user-not-planned", "org-1");
		updateImportJob(importId, {
			status: "applying",
			snapshot: { resources: { services: [] } } as any,
			plan: { target: { kind: "newProject", name: "x" } } as any,
		});
		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", "user-not-planned"),
		);
		await expect(caller.importStart({ importId })).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});

	it("only lets the user who started the import reveal its secrets", async () => {
		const importId = "import-router-other-user";
		createImportJob(importId, "user-a", "org-1");
		updateImportJob(importId, {
			status: "unlocked",
			snapshot: { resources: { services: [], shared: {} } } as any,
			secretsPlain: new Map([["s", "v"]]),
		});
		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", "user-b"),
		);
		await expect(
			caller.importSecretReveal({ importId, secretId: "s" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("restores the original secret when an override is dropped from a later call", async () => {
		const importId = "import-router-override-reset";
		createImportJob(importId, "user-1", "org-1");
		updateImportJob(importId, {
			status: "unlocked",
			snapshot: {
				resources: {
					services: [],
					shared: {
						registry: [{ registryName: "ghcr", password: "$secret:reg-1" }],
					},
				},
			} as any,
			secretsPlain: new Map([["reg-1", "original"]]),
		});
		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));

		await caller.importSecretsOverride({
			importId,
			overrides: { "reg-1": "replaced" },
		});
		expect(getImportJob(importId)?.secretsPlain?.get("reg-1")).toBe("replaced");

		await caller.importSecretsOverride({ importId, overrides: {} });
		expect(getImportJob(importId)?.secretsPlain?.get("reg-1")).toBe("original");
	});

	it("only deletes objects that look like export bundles", async () => {
		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", "user-delete-bundle"),
		);
		await expect(
			caller.deleteRemoteBundle({
				destinationId: "dest-1",
				key: "backups/production.sql.gz",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("reports unknown or foreign export ids as errors in exportBatchStatus", async () => {
		createExportJob("batch-other-org", "user-1", "org-2");
		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(
			caller.exportBatchStatus({ exportIds: ["nope", "batch-other-org"] }),
		).resolves.toEqual([
			{ exportId: "nope", status: "error", error: "Export not found" },
			{
				exportId: "batch-other-org",
				status: "error",
				error: "Export not found",
			},
		]);
	});

	it("parses the full organization scope and a bare preview scope with defaults", async () => {
		const full = exportScopeSchema.parse({ dumps: { mode: "embed" } });
		expect(full).toEqual({
			includeEnvSecrets: true,
			shared: {},
			files: {
				applicationSources: true,
				composeFiles: true,
				traefikRaw: true,
				customCertificates: true,
			},
			dumps: { mode: "embed" },
			includeBackupSchedules: true,
		});
		expect(exportScopeSchema.parse({}).dumps.mode).toBe("none");
	});

	it("rejects an organization export to a destination the organization does not own", async () => {
		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", "user-org-export"),
		);
		await expect(
			caller.exportOrganizationStart({
				destinationId: "dest-of-org-2",
				passphrase: "a-long-enough-passphrase",
				projectIds: ["project-1"],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("rejects exportStart with a destination the organization does not own", async () => {
		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", "user-export-dest"),
		);
		await expect(
			caller.exportStart({
				projectId: "project-1",
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
				passphrase: "a-long-enough-passphrase",
				deliver: { kind: "destination", destinationId: "dest-of-org-2" },
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("projectExportImportRouter.importValidate", () => {
	it("rejects with BAD_REQUEST before importPlan ran", async () => {
		const importId = "import-router-validate-early";
		createImportJob(importId, "user-validate-early", "org-1");
		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", "user-validate-early"),
		);
		await expect(caller.importValidate({ importId })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("stores the checks on the plan and returns them", async () => {
		const importId = "import-router-validate-store";
		createImportJob(importId, "user-validate-store", "org-1");
		updateImportJob(importId, {
			status: "planned",
			snapshot: { resources: { services: [] } } as any,
			plan: {
				target: { kind: "newProject", name: "x" },
				validation: [],
			} as any,
		});
		(validatePlan as any).mockReset();
		(validatePlan as any).mockResolvedValue([
			{ check: "server:local", ok: false, detail: "unreachable" },
		]);
		const caller = projectExportImportRouter.createCaller(
			ctxFor("org-1", "user-validate-store"),
		);
		const result = await caller.importValidate({ importId });
		(validatePlan as any).mockReset();
		(validatePlan as any).mockResolvedValue([]);
		expect(result.checks).toEqual([
			{ check: "server:local", ok: false, detail: "unreachable" },
		]);
		const status = await caller.importStatus({ importId });
		expect(status.plan?.validation).toEqual(result.checks);
	});
});

describe("projectExportImportRouter.importUnlock (T-9.6)", () => {
	it("rejects a passphrase under 12 characters at the input-validation layer", async () => {
		const importId = "import-router-unlock-1";
		createImportJob(importId, "user-1", "org-1");
		updateImportJob(importId, { workDir: local("/tmp/does-not-matter") });

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(
			caller.importUnlock({ importId, passphrase: "short" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

describe("projectExportImportRouter.importPlan", () => {
	it("rejects with BAD_REQUEST when importUnlock hasn't run yet", async () => {
		const importId = "import-router-4";
		createImportJob(importId, "user-1", "org-1");

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(
			caller.importPlan({
				importId,
				target: { kind: "newProject", name: "imported" },
				choices: {},
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("passes target.projectId to assertTransferPermission for an existingProject target", async () => {
		const importId = "import-router-5";
		createImportJob(importId, "user-1", "org-1");

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await caller
			.importPlan({
				importId,
				target: {
					kind: "existingProject",
					projectId: "project-other-org",
					environmentName: "imported",
				},
				choices: {},
			})
			.catch(() => {});

		const lastCall = (assertTransferPermission as any).mock.calls.at(-1);
		expect(lastCall[1]).toBe("project-other-org");
	});

	it("passes undefined projectId to assertTransferPermission for a newProject target", async () => {
		const importId = "import-router-6";
		createImportJob(importId, "user-1", "org-1");

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await caller
			.importPlan({
				importId,
				target: { kind: "newProject", name: "imported" },
				choices: {},
			})
			.catch(() => {});

		const lastCall = (assertTransferPermission as any).mock.calls.at(-1);
		expect(lastCall[1]).toBeUndefined();
	});

	it("blocks importing a multi-environment bundle into an existing project that can't fit all of them (T-6.16)", async () => {
		const { getCurrentPlan } = await import("@/server/utils/billing");
		(getCurrentPlan as any).mockResolvedValueOnce("hobby");

		const importId = "import-router-env-limit-1";
		createImportJob(importId, "user-1", "org-1");
		updateImportJob(importId, {
			snapshot: {
				resources: { environments: [{}, {}, {}], services: [] },
			} as any,
		});

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));

		await expect(
			caller.importPlan({
				importId,
				target: {
					kind: "existingProject",
					projectId: "project-1",
					environmentName: "imported",
				},
				choices: {},
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("projectExportImportRouter.importCancel", () => {
	it("returns NOT_FOUND for an unknown importId", async () => {
		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(
			caller.importCancel({ importId: "does-not-exist" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("maps a still-running import to CONFLICT", async () => {
		const importId = "import-cancel-router-1";
		createImportJob(importId, "user-1", "org-1");
		updateImportJob(importId, { status: "restoring" });

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(caller.importCancel({ importId })).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});
});

describe("projectExportImportRouter.exportCancel (T-6.7)", () => {
	it("maps a still-running export to CONFLICT", async () => {
		const exportId = "export-cancel-router-1";
		const job = createExportJob(exportId, "user-1", "org-1");
		job.status = "dumping";

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(caller.exportCancel({ exportId })).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});
});

describe("projectExportImportRouter *Status permission gating (T-5.2)", () => {
	it("exportStatus and importStatus both reject a non-owner/admin with FORBIDDEN", async () => {
		const exportId = "export-status-forbidden-1";
		createExportJob(exportId, "user-1", "org-1");
		const importId = "import-status-forbidden-1";
		createImportJob(importId, "user-1", "org-1");

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		const { TRPCError } = await import("@trpc/server");
		const forbidden = () =>
			new TRPCError({
				code: "FORBIDDEN",
				message: "Only organization owners and admins can do that",
			});

		(assertTransferPermission as any).mockRejectedValueOnce(forbidden());
		await expect(caller.exportStatus({ exportId })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});

		(assertTransferPermission as any).mockRejectedValueOnce(forbidden());
		await expect(caller.importStatus({ importId })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	it("exportStatus still returns downloadToken to an authorized caller (the UI needs it to build the download link)", async () => {
		const exportId = "export-status-token-1";
		createExportJob(exportId, "user-1", "org-1");
		const { updateExportJob } = await import(
			"@dokploy/server/services/project-export-import"
		);
		updateExportJob(exportId, {
			status: "done",
			downloadToken: "tok-abc123",
		});

		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		const result = await caller.exportStatus({ exportId });
		expect((result as any).downloadToken).toBe("tok-abc123");
	});
});
