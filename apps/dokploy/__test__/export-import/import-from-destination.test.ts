import { ExecError } from "@dokploy/server/utils/process/execAsync";
import { describe, expect, it, vi } from "vitest";

vi.mock(
	"@dokploy/server/services/project-export-import",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/services/project-export-import")
			>();
		const execError = (command: string) =>
			new ExecError(`Command execution failed: Command failed: ${command}`, {
				command,
				stderr: "NoSuchKey: The specified key does not exist",
				exitCode: 1,
			});
		return {
			...actual,
			assertTransferPermission: vi.fn(async () => ({ role: "owner" })),
			downloadBundleFromDestination: vi.fn(async () => {
				throw execError(
					"rclone copyto --s3-secret-access-key=realsecretkey789 :s3:mybucket/key.tar.gz /tmp/bundle.tar.gz",
				);
			}),
			listBundlesUnderPrefix: vi.fn(async () => {
				throw execError(
					"rclone lsjson --s3-secret-access-key=realsecretkey789 :s3:mybucket",
				);
			}),
		};
	},
);

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			destinations: {
				findFirst: vi.fn(async () => ({
					destinationId: "destination-1",
					organizationId: "org-1",
					bucket: "mybucket",
				})),
			},
		},
	},
}));

const { projectExportImportRouter } = await import(
	"../../server/api/routers/project-export-import"
);

const ctxFor = (organizationId: string) =>
	({
		session: { activeOrganizationId: organizationId },
		user: { id: "user-1", email: "a@b.com" },
	}) as any;

describe("projectExportImportRouter.importFromDestination / listRemoteBundles (T-5.5)", () => {
	it("importFromDestination never leaks the destination's S3 secret in its error message", async () => {
		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(
			caller.importFromDestination({
				destinationId: "destination-1",
				key: "key.tar.gz",
			}),
		).rejects.toSatisfy((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			expect(message).not.toContain("realsecretkey789");
			return true;
		});
	});

	it("listRemoteBundles never leaks the destination's S3 secret in its error message", async () => {
		const caller = projectExportImportRouter.createCaller(ctxFor("org-1"));
		await expect(
			caller.listRemoteBundles({ destinationId: "destination-1" }),
		).rejects.toSatisfy((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			expect(message).not.toContain("realsecretkey789");
			return true;
		});
	});
});
