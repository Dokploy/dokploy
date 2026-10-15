import {
	assertNoActiveTransfer,
	createExportJob,
	createImportJob,
	createImportJobIfNoneActive,
	getImportJob,
	updateExportJob,
	updateImportJob,
} from "@dokploy/server/services/project-export-import";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

describe("assertNoActiveTransfer (T-4.2)", () => {
	it("throws when the user has an in-progress export", () => {
		createExportJob("export-rl-1", "user-rl-1", "org-1");
		updateExportJob("export-rl-1", { status: "capturing" });

		expect(() => assertNoActiveTransfer("user-rl-1")).toThrow(TRPCError);
	});

	it("throws when the user has an in-progress import", () => {
		createImportJob("import-rl-1", "user-rl-2", "org-1");
		updateImportJob("import-rl-1", { status: "applying" });

		expect(() => assertNoActiveTransfer("user-rl-2")).toThrow(TRPCError);
	});

	it("does not throw once the job reaches a terminal status", () => {
		createExportJob("export-rl-2", "user-rl-3", "org-1");
		updateExportJob("export-rl-2", { status: "done" });
		createImportJob("import-rl-2", "user-rl-3", "org-1");
		updateImportJob("import-rl-2", { status: "done" });

		expect(() => assertNoActiveTransfer("user-rl-3")).not.toThrow();
	});

	it("does not throw for a different user's in-progress job", () => {
		createExportJob("export-rl-3", "user-rl-4", "org-1");
		updateExportJob("export-rl-3", { status: "capturing" });

		expect(() => assertNoActiveTransfer("user-rl-someone-else")).not.toThrow();
	});
});

describe("createImportJobIfNoneActive (T-5.11)", () => {
	it("the second of two back-to-back calls for the same user fails, even with no active job at the time of either's own separate check", () => {
		createImportJobIfNoneActive("import-atomic-1", "user-atomic-1", "org-1");

		expect(() =>
			createImportJobIfNoneActive("import-atomic-2", "user-atomic-1", "org-1"),
		).toThrow(TRPCError);

		expect(getImportJob("import-atomic-1")).toBeDefined();
		expect(getImportJob("import-atomic-2")).toBeUndefined();
	});

	it("still allows a different user's call to proceed", () => {
		createImportJobIfNoneActive("import-atomic-3", "user-atomic-2", "org-1");

		expect(() =>
			createImportJobIfNoneActive("import-atomic-4", "user-atomic-3", "org-1"),
		).not.toThrow();
		expect(getImportJob("import-atomic-4")).toBeDefined();
	});
});
