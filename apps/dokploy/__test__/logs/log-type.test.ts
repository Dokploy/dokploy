import { getLogType } from "../../components/dashboard/docker/logs/utils";
import { describe, expect, test } from "vitest";

describe("getLogType", () => {
	describe("Structured error patterns", () => {
		test("should detect [ERROR] format", () => {
			expect(getLogType("[ERROR] Database connection failed").type).toBe("error");
		});

		test("should detect ERROR: format", () => {
			expect(getLogType("ERROR: Connection refused").type).toBe("error");
		});

		test("should detect level=error format", () => {
			expect(getLogType('level=error msg="Database connection failed"').type).toBe("error");
		});

		test("should detect error emojis", () => {
			expect(getLogType("❌ Operation failed").type).toBe("error");
			expect(getLogType("🔴 Critical issue").type).toBe("error");
		});
	});

	describe("Contextual error patterns", () => {
		test("should detect uncaught exceptions", () => {
			expect(getLogType("Uncaught exception in handler").type).toBe("error");
		});

		test("should detect 'failed to' patterns", () => {
			expect(getLogType("Failed to start server").type).toBe("error");
		});

		test("should detect 'X failed with' patterns", () => {
			expect(getLogType("Token exchange failed with status: 400").type).toBe("error");
		});

		test("should detect HTTP error codes", () => {
			expect(getLogType("Request returned status: 400").type).toBe("error");
			expect(getLogType("500 Internal Server Error").type).toBe("error");
		});

		test("should detect stack trace lines", () => {
			expect(getLogType("    at Object.<anonymous> (/app/server.js:123:45)").type).toBe("error");
		});
	});

	describe("False positives - should NOT be detected as errors", () => {
		test("should not flag 'Failed=0' as error", () => {
			const result = getLogType('time="2025-11-20T08:19:13Z" level=info msg="Session done" Failed=0 Scanned=1');
			expect(result.type).toBe("info");
		});

		test("should not flag '0 failed' as error", () => {
			expect(getLogType("0 practices builds failed, and 0 uploads failed.").type).toBe("info");
		});

		test("should not flag negative contexts as error", () => {
			expect(getLogType("The operation did not fail").type).toBe("info");
		});

		test("should not flag conditional statements as error", () => {
			expect(getLogType("If failed, retry the operation").type).toBe("info");
		});
	});

	describe("Warning patterns", () => {
		test("should detect [WARN] format", () => {
			expect(getLogType("[WARN] API rate limit approaching").type).toBe("warning");
		});

		test("should detect WARNING: format", () => {
			expect(getLogType("WARNING: Disk space low").type).toBe("warning");
		});

		test("should detect warning emojis", () => {
			expect(getLogType("⚠️ Token exchange failed with status: 400 Bad Request").type).not.toBe("info");
		});

		test("should detect deprecated warnings", () => {
			expect(getLogType("Deprecated since version 2.0").type).toBe("warning");
		});
	});

	describe("Success patterns", () => {
		test("should detect [SUCCESS] format", () => {
			expect(getLogType("[SUCCESS] Deployment completed").type).toBe("success");
		});

		test("should detect 'listening on port' patterns", () => {
			expect(getLogType("Server listening on port 3000").type).toBe("success");
		});

		test("should detect 'successfully' patterns", () => {
			expect(getLogType("Successfully connected to database").type).toBe("success");
		});

		test("should detect success emojis", () => {
			expect(getLogType("✅ Build completed").type).toBe("success");
		});
	});

	describe("Debug patterns", () => {
		test("should detect [DEBUG] format", () => {
			expect(getLogType("[DEBUG] Processing request").type).toBe("debug");
		});

		test("should detect HTTP method patterns", () => {
			expect(getLogType("GET /api/users").type).toBe("debug");
			expect(getLogType("POST /api/login").type).toBe("debug");
		});
	});

	describe("Info patterns (default)", () => {
		test("should default to info for generic messages", () => {
			expect(getLogType("Server started").type).toBe("info");
		});

		test("should detect [INFO] format", () => {
			expect(getLogType("[INFO] Application initialized").type).toBe("info");
		});
	});
});
