import {
	resolveBuiltImages,
	sanitizeImageTag,
} from "@dokploy/server/utils/builders/compose";
import { applyPrebuiltImages } from "@dokploy/server/utils/docker/domain";
import { describe, expect, it } from "vitest";

describe("resolveBuiltImages", () => {
	it("returns services that have both build and image", () => {
		const json = JSON.stringify({
			services: {
				api: { build: { context: "." }, image: "my-app-api" },
				db: { image: "postgres:16" },
			},
		});
		expect(resolveBuiltImages(json)).toEqual([
			{ service: "api", localImage: "my-app-api" },
		]);
	});
});

describe("applyPrebuiltImages", () => {
	it("replaces build with registry image on deploy side", () => {
		const spec = {
			services: {
				api: { build: { context: "." }, image: "local" },
			},
		};
		const result = applyPrebuiltImages(spec, {
			api: "registry.example.com/org/my-app-api:deadbeef",
		});
		expect(result.services?.api?.image).toBe(
			"registry.example.com/org/my-app-api:deadbeef",
		);
		expect(result.services?.api?.build).toBeUndefined();
	});
});

describe("sanitizeImageTag", () => {
	it("normalizes git sha for docker tags", () => {
		expect(sanitizeImageTag("abc/def+001")).toBe("abc-def-001");
	});
});
