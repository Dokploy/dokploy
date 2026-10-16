import {
	buildBundleObjectKey,
	deriveKeys,
	EXPORTS_DIRECTORY,
	makeKeyCheck,
	slugifyProjectName,
	verifyBundlePassphrase,
} from "@dokploy/server/services/project-export-import";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return { ...actual, execAsync: vi.fn(actual.execAsync) };
});

describe("slugifyProjectName", () => {
	it("produces a lowercase, URL-safe slug", () => {
		expect(slugifyProjectName("My Cool Project!")).toBe("my-cool-project");
	});

	it("falls back to a generic name for an empty/unslugifiable input", () => {
		expect(slugifyProjectName("")).toBe("project");
	});
});

describe("buildBundleObjectKey", () => {
	it("always stores bundles under the fixed exports directory", () => {
		const key = buildBundleObjectKey("my-project", "2024-01-01T00:00:00.000Z");
		expect(key).toBe(
			`${EXPORTS_DIRECTORY}/my-project-2024-01-01T00-00-00-000Z.dokploy.tar.gz`,
		);
		expect(EXPORTS_DIRECTORY).toBe("dokploy-export-import");
	});
});

describe("verifyBundlePassphrase", () => {
	it("checks the keyCheck of a manifest read from the head of the object", async () => {
		const { salt, kEnc } = await deriveKeys("correct-horse-battery-staple");
		const manifest = {
			format: "dokploy-project-export",
			formatVersion: 1,
			exportedAt: "2024-01-01T00:00:00.000Z",
			exportedBy: { userId: "user-1", email: "a@b.com" },
			sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-1" },
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
				salt,
				kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
				keyCheck: makeKeyCheck(kEnc),
			},
			counts: {},
		};
		vi.mocked(execAsync).mockResolvedValueOnce({
			stdout: JSON.stringify(manifest),
			stderr: "",
		});
		const destination = { bucket: "b", endpoint: "e", region: "r" } as any;

		await expect(
			verifyBundlePassphrase(
				destination,
				"x.dokploy.tar.gz",
				"correct-horse-battery-staple",
			),
		).resolves.toMatchObject({ checked: true, valid: true });

		vi.mocked(execAsync).mockResolvedValueOnce({
			stdout: JSON.stringify(manifest),
			stderr: "",
		});
		await expect(
			verifyBundlePassphrase(
				destination,
				"x.dokploy.tar.gz",
				"wrong-passphrase-here",
			),
		).resolves.toMatchObject({ checked: true, valid: false });

		vi.mocked(execAsync).mockResolvedValueOnce({ stdout: "", stderr: "" });
		await expect(
			verifyBundlePassphrase(
				destination,
				"x.dokploy.tar.gz",
				"correct-horse-battery-staple",
			),
		).resolves.toMatchObject({ checked: false });
		expect(vi.mocked(execAsync).mock.calls[0]?.[0]).toContain("rclone cat");
		expect(vi.mocked(execAsync).mock.calls[0]?.[0]).toContain(
			"tar -xzOf - manifest.json ",
		);
		expect(vi.mocked(execAsync).mock.calls[0]?.[0]).toContain(
			"--count 4194304",
		);
	});
});

describe("projectExportImportRouter.exportStart on IS_CLOUD", () => {
	it("rejects deliver: download (or omitted) with BAD_REQUEST", async () => {
		vi.resetModules();
		process.env.IS_CLOUD = "true";

		vi.doMock(
			"@dokploy/server/services/project-export-import",
			async (importOriginal) => {
				const actual =
					await importOriginal<
						typeof import("@dokploy/server/services/project-export-import")
					>();
				return {
					...actual,
					assertTransferPermission: vi.fn(async () => ({ role: "owner" })),
				};
			},
		);

		const { projectExportImportRouter } = await import(
			"../../server/api/routers/project-export-import"
		);
		const caller = projectExportImportRouter.createCaller({
			session: { activeOrganizationId: "org-1" },
			user: { id: "user-1", email: "a@b.com" },
		} as any);

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
				passphrase: "correct-horse-battery-staple",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		delete process.env.IS_CLOUD;
		vi.doUnmock("@dokploy/server/services/project-export-import");
		vi.resetModules();
	}, 30_000);
});

describe("projectExportImportRouter.exportOrganizationStart on IS_CLOUD", () => {
	it("skips projects with no remote server instead of failing the whole batch", async () => {
		vi.resetModules();
		process.env.IS_CLOUD = "true";
		const runExportBatch = vi.fn(() => ({ exportIds: ["export-1"] }));

		vi.doMock("@dokploy/server/db", () => ({
			db: {
				query: {
					projects: {
						findMany: async () => [
							{ projectId: "with-server", name: "With server" },
							{ projectId: "empty", name: "Empty" },
						],
					},
				},
			},
		}));
		vi.doMock(
			"@dokploy/server/services/project-export-import",
			async (importOriginal) => {
				const actual =
					await importOriginal<
						typeof import("@dokploy/server/services/project-export-import")
					>();
				return {
					...actual,
					assertTransferPermission: vi.fn(async () => ({ role: "owner" })),
					findOrganizationDestination: vi.fn(async () => ({})),
					bundleBuildServer: vi.fn(async (_db, projectId: string) => {
						if (projectId === "with-server") return "server-1";
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "none of the selected services runs on a remote server",
						});
					}),
					runExportBatch,
				};
			},
		);
		vi.doMock("../../server/api/utils/audit", () => ({ audit: vi.fn() }));

		const { projectExportImportRouter } = await import(
			"../../server/api/routers/project-export-import"
		);
		const caller = projectExportImportRouter.createCaller({
			session: { activeOrganizationId: "org-1" },
			user: { id: "user-org-cloud", email: "a@b.com" },
		} as any);

		const result = await caller.exportOrganizationStart({
			destinationId: "dest-1",
			passphrase: "correct-horse-battery-staple",
			projectIds: ["with-server", "empty", "with-server"],
		});

		expect(result.exports).toEqual([
			{ projectId: "with-server", name: "With server", exportId: "export-1" },
		]);
		expect(result.skipped).toMatchObject([{ projectId: "empty" }]);
		expect(runExportBatch).toHaveBeenCalledWith(
			[expect.objectContaining({ buildServerId: "server-1" })],
			expect.anything(),
		);

		delete process.env.IS_CLOUD;
		vi.doUnmock("@dokploy/server/db");
		vi.doUnmock("@dokploy/server/services/project-export-import");
		vi.doUnmock("../../server/api/utils/audit");
		vi.resetModules();
	}, 30_000);
});
