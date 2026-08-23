import { shouldDeploy } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("shouldDeploy", () => {
	it("should deploy when no watch paths are configured", () => {
		expect(shouldDeploy(null, ["src/index.ts"])).toBe(true);
		expect(shouldDeploy([], ["src/index.ts"])).toBe(true);
	});

	it("should deploy when watch paths match modified files", () => {
		expect(shouldDeploy(["src/**"], ["src/index.ts"])).toBe(true);
		expect(shouldDeploy(["apps/web/**"], ["apps/web/page.tsx"])).toBe(true);
	});

	it("should not deploy when watch paths do not match", () => {
		expect(shouldDeploy(["src/**"], ["docs/readme.md"])).toBe(false);
	});

	it("should not throw when modified files contain non-string values", () => {
		expect(() =>
			shouldDeploy(["src/**"], ["src/index.ts", undefined, null] as any),
		).not.toThrow();
		expect(
			shouldDeploy(["src/**"], ["src/index.ts", undefined, null] as any),
		).toBe(true);
	});

	it("should not throw when modified files are undefined or null", () => {
		expect(() => shouldDeploy(["src/**"], undefined)).not.toThrow();
		expect(() => shouldDeploy(["src/**"], null)).not.toThrow();
		expect(shouldDeploy(["src/**"], undefined)).toBe(false);
		expect(shouldDeploy(["src/**"], null)).toBe(false);
	});

	it("should not throw when every modified file is non-string", () => {
		expect(() =>
			shouldDeploy(["src/**"], [undefined, undefined] as any),
		).not.toThrow();
		expect(shouldDeploy(["src/**"], [undefined, undefined] as any)).toBe(false);
	});
});
