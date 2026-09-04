import { randomInt } from "node:crypto";
import { generatePassword } from "@dokploy/server/templates";
import { describe, expect, it, vi } from "vitest";

// Wrap `node:crypto.randomInt` with a spy that delegates to the real CSPRNG
// so we can confirm `generatePassword` draws from it while keeping true
// CSPRNG output for every behavioral assertion. `vi.mock` is hoisted above
// the `import` statements automatically.
vi.mock("node:crypto", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:crypto")>();
	return {
		...actual,
		randomInt: vi.fn(actual.randomInt),
	};
});

describe("generatePassword", () => {
	it("defaults to a 16-character string", () => {
		expect(generatePassword()).toHaveLength(16);
	});

	it.each([6, 16, 32])(
		"generates a string of length %d when requested",
		(length) => {
			expect(generatePassword(length)).toHaveLength(length);
		},
	);

	// `.toLowerCase()` is load-bearing: the function is dual-use and the
	// app/service-name suffix callers (buildAppName, createPreviewDeployment)
	// require DNS-label / Docker-Swarm-service-name-safe lowercase output.
	it("produces only lowercase alphanumeric characters", () => {
		for (let i = 0; i < 200; i++) {
			expect(generatePassword()).toMatch(/^[a-z0-9]+$/);
		}
	});

	// Credential material must come from a CSPRNG, not Math.random().
	// This guards against reintroducing the regression fixed here.
	it("does not source randomness from Math.random()", () => {
		const randomSpy = vi.spyOn(Math, "random");
		randomSpy.mockClear();

		generatePassword(32);

		expect(randomSpy).not.toHaveBeenCalled();
		randomSpy.mockRestore();
	});

	it("sources randomness from node:crypto (crypto.randomInt)", () => {
		const randomIntSpy = randomInt as unknown as ReturnType<typeof vi.fn>;
		randomIntSpy.mockClear();

		const password = generatePassword(16);

		expect(randomIntSpy).toHaveBeenCalled();
		expect(password).toHaveLength(16);
	});

	it("produces distinct values across calls", () => {
		const samples = new Set<string>();
		for (let i = 0; i < 1000; i++) {
			samples.add(generatePassword());
		}
		expect(samples.size).toBe(1000);
	});
});
