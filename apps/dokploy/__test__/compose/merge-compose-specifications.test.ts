import { mergeComposeSpecifications } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("mergeComposeSpecifications", () => {
	it("returns null when every spec is null", () => {
		expect(mergeComposeSpecifications([null, null])).toBeNull();
	});

	it("returns the single non-null spec untouched", () => {
		const spec = { services: { web: { image: "nginx" } } };
		expect(mergeComposeSpecifications([spec, null])).toEqual(spec);
	});

	it("adds a service that only exists in an additional file", () => {
		const base = { services: { web: { image: "nginx" } } };
		const additional = { services: { worker: { image: "redis" } } };

		const merged = mergeComposeSpecifications([base, additional]);

		expect(Object.keys(merged?.services ?? {})).toEqual(["web", "worker"]);
	});

	it("layers an override's keys onto a service shared with the base file", () => {
		const base = {
			services: { web: { image: "ghcr.io/org/web:1.0.0" } },
		};
		const additional = {
			services: { web: { build: { context: "./web" } } },
		};

		const merged = mergeComposeSpecifications([base, additional]);

		expect(merged?.services?.web).toEqual({
			image: "ghcr.io/org/web:1.0.0",
			build: { context: "./web" },
		});
	});

	it("applies additional files in order, later files winning on conflicting keys", () => {
		const base = { services: { web: { image: "a" } } };
		const first = { services: { web: { image: "b" } } };
		const second = { services: { web: { image: "c" } } };

		const merged = mergeComposeSpecifications([base, first, second]);

		expect(merged?.services?.web).toEqual({ image: "c" });
	});

	it("skips null entries mixed in with real specs", () => {
		const base = { services: { web: { image: "nginx" } } };
		const additional = { services: { worker: { image: "redis" } } };

		const merged = mergeComposeSpecifications([base, null, additional, null]);

		expect(Object.keys(merged?.services ?? {})).toEqual(["web", "worker"]);
	});
});
