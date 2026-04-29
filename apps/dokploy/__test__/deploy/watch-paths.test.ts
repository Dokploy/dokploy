import { describe, expect, it } from "vitest";
import { shouldDeploy } from "../../../../packages/server/src/utils/watch-paths/should-deploy";

describe("shouldDeploy", () => {
	it("returns false instead of throwing when modified files are missing", () => {
		expect(() => shouldDeploy(["steam/**"], undefined as any)).not.toThrow();
		expect(shouldDeploy(["steam/**"], undefined as any)).toBe(false);
	});

	it("returns false instead of throwing when modified files contain nullish entries only", () => {
		expect(() => shouldDeploy(["steam/**"], [undefined] as any)).not.toThrow();
		expect(shouldDeploy(["steam/**"], [undefined] as any)).toBe(false);
	});

	it("still matches valid modified paths when nullish entries are mixed in", () => {
		expect(
			shouldDeploy(["steam/**"], [undefined, "steam/src/app.ts"] as any),
		).toBe(true);
	});
});
