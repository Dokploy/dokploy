import { safeErrorMessage } from "@dokploy/server/services/project-export-import";
import { ExecError } from "@dokploy/server/utils/process/execAsync";
import { describe, expect, it } from "vitest";

describe("safeErrorMessage (T-4.2)", () => {
	it("never includes the command (which may embed a plaintext password) for an ExecError", () => {
		const error = new ExecError(
			"Command execution failed: Command failed: PGPASSWORD=realpassword123 pg_dump -U dokploy mydb",
			{
				command: "PGPASSWORD=realpassword123 pg_dump -U dokploy mydb",
				stderr:
					"pg_dump: error: connection failed: FATAL: password authentication failed",
				exitCode: 1,
			},
		);
		const message = safeErrorMessage(error);
		expect(message).not.toContain("realpassword123");
		expect(message).not.toContain("PGPASSWORD");
		expect(message).toContain("exit code 1");
		expect(message).toContain("password authentication failed");
	});

	it("falls back to a generic message when an ExecError has no stderr", () => {
		const error = new ExecError("Command execution failed", {
			command: "PGPASSWORD=secret pg_dump",
		});
		const message = safeErrorMessage(error);
		expect(message).not.toContain("secret");
		expect(message).toBe("Command failed");
	});

	it("passes a plain Error's message through unchanged", () => {
		expect(safeErrorMessage(new Error("Service not found"))).toBe(
			"Service not found",
		);
	});

	it("stringifies a non-Error thrown value", () => {
		expect(safeErrorMessage("boom")).toBe("boom");
	});
});
