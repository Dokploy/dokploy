import { beforeEach, describe, expect, it, vi } from "vitest";

const dockerVolumeMocks = vi.hoisted(() => ({
	removeVolume: vi.fn(),
}));
vi.mock("@dokploy/server/services/docker-volume", () => dockerVolumeMocks);

const dockerUtilsMocks = vi.hoisted(() => ({
	removeService: vi.fn(),
}));
vi.mock("@dokploy/server/utils/docker/utils", () => dockerUtilsMocks);

import {
	isMissingResourceError,
	removeServiceIdempotent,
	removeVolumeIdempotent,
} from "@dokploy/server/utils/migration/cleanup";

describe("isMissingResourceError", () => {
	it("recognizes common docker/stack 'already gone' phrasings", () => {
		expect(isMissingResourceError(new Error("no such volume: foo"))).toBe(true);
		expect(
			isMissingResourceError(new Error("Error: No such service: foo")),
		).toBe(true);
		expect(
			isMissingResourceError(new Error("Nothing found in stack: foo")),
		).toBe(true);
		expect(isMissingResourceError(new Error("service foo not found"))).toBe(
			true,
		);
	});

	it("does not treat real failures as an already-gone resource", () => {
		expect(isMissingResourceError(new Error("permission denied"))).toBe(false);
		expect(isMissingResourceError(new Error("volume foo is in use"))).toBe(
			false,
		);
		expect(isMissingResourceError(null)).toBe(false);
		expect(isMissingResourceError(undefined)).toBe(false);
	});
});

describe("removeVolumeIdempotent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("treats an already-removed volume as success (retryable finalize)", async () => {
		dockerVolumeMocks.removeVolume.mockRejectedValue(
			new Error("no such volume: foo"),
		);
		await expect(removeVolumeIdempotent("foo", null)).resolves.toBeUndefined();
	});

	it("propagates a real removal failure instead of swallowing it", async () => {
		dockerVolumeMocks.removeVolume.mockRejectedValue(
			new Error("volume foo is in use"),
		);
		await expect(removeVolumeIdempotent("foo", null)).rejects.toThrow("in use");
	});

	it("succeeds when removal succeeds", async () => {
		dockerVolumeMocks.removeVolume.mockResolvedValue(undefined);
		await expect(removeVolumeIdempotent("foo", null)).resolves.toBeUndefined();
	});
});

describe("removeServiceIdempotent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("treats an already-removed service as success", async () => {
		// removeService reports failures via its return value, not by throwing.
		dockerUtilsMocks.removeService.mockResolvedValue(
			new Error("no such service: foo"),
		);
		await expect(removeServiceIdempotent("foo", null)).resolves.toBeUndefined();
	});

	it("propagates a real removal failure instead of swallowing it", async () => {
		dockerUtilsMocks.removeService.mockResolvedValue(
			new Error("permission denied"),
		);
		await expect(removeServiceIdempotent("foo", null)).rejects.toThrow(
			"permission denied",
		);
	});

	it("succeeds when removeService reports no error", async () => {
		dockerUtilsMocks.removeService.mockResolvedValue(undefined);
		await expect(removeServiceIdempotent("foo", null)).resolves.toBeUndefined();
	});
});
