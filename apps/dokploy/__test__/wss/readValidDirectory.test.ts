import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const BASE = "/base";

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		paths: () => ({
			...actual.paths(),
			BASE_PATH: BASE,
			LOGS_PATH: `${BASE}/logs`,
			APPLICATIONS_PATH: `${BASE}/applications`,
		}),
	};
});

// Import after mock so paths() uses our BASE
const { readValidDirectory } = await import("@dokploy/server");

describe("readValidDirectory (path traversal)", () => {
	it("returns true when directory is exactly BASE_PATH", () => {
		expect(readValidDirectory(BASE)).toBe(true);
		expect(readValidDirectory(path.resolve(BASE))).toBe(true);
	});

	it("returns true when directory is under BASE_PATH", () => {
		expect(readValidDirectory(`${BASE}/logs`)).toBe(true);
		expect(readValidDirectory(`${BASE}/logs/app/foo.log`)).toBe(true);
		expect(readValidDirectory(`${BASE}/applications/myapp/code`)).toBe(true);
	});

	it("returns false for path traversal escaping base (absolute)", () => {
		expect(readValidDirectory("/etc/passwd")).toBe(false);
		expect(readValidDirectory("/etc/cron.d/malicious")).toBe(false);
		expect(readValidDirectory("/tmp/outside")).toBe(false);
	});

	it("returns false when resolved path escapes base via ..", () => {
		// Resolved: /etc/passwd (outside /base)
		expect(readValidDirectory(`${BASE}/../etc/passwd`)).toBe(false);
		expect(readValidDirectory(`${BASE}/logs/../../etc/passwd`)).toBe(false);
		expect(readValidDirectory(`${BASE}/..`)).toBe(false);
	});

	it("returns true when .. stays within base", () => {
		// e.g. /base/logs/../applications -> /base/applications (still under /base)
		expect(readValidDirectory(`${BASE}/logs/../applications`)).toBe(true);
		expect(readValidDirectory(`${BASE}/foo/../bar`)).toBe(true);
	});

	it("accepts serverId for remote base path", () => {
		// With our mock, serverId doesn't change BASE_PATH; just ensure it doesn't throw
		expect(readValidDirectory(BASE, "server-1")).toBe(true);
		expect(readValidDirectory("/etc/passwd", "server-1")).toBe(false);
	});

	it("returns false for null/undefined-like paths that resolve outside", () => {
		// Paths that might resolve to cwd or root
		expect(readValidDirectory(".")).toBe(false);
		expect(readValidDirectory("..")).toBe(false);
	});

	it("returns true for BASE_PATH with trailing slash or double slashes under base", () => {
		expect(readValidDirectory(`${BASE}/`)).toBe(true);
		expect(readValidDirectory(`${BASE}//logs`)).toBe(true);
		expect(readValidDirectory(`${BASE}/applications///myapp/code`)).toBe(true);
	});

	it("returns false when path looks like base but is a sibling or prefix", () => {
		expect(readValidDirectory("/base-evil")).toBe(false);
		expect(readValidDirectory("/bas")).toBe(false);
		expect(readValidDirectory(`${BASE}/../base-evil`)).toBe(false);
	});

	it("returns false for empty string (resolves to cwd)", () => {
		expect(readValidDirectory("")).toBe(false);
	});
});
