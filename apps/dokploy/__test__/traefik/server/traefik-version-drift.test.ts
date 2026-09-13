import { describe, expect, it } from "vitest";

export const parseTraefikVersion = (
	imageString: string | null | undefined,
): string | null => {
	if (!imageString) {
		return null;
	}
	const match = imageString.match(
		/(?:^|\/)traefik:(?:v)?([0-9]+(?:\.[0-9]+)+(?:-[a-zA-Z0-9.]+)?)/,
	);
	if (match?.[1]) {
		return match[1];
	}
	const genericMatch = imageString.match(/:v?([0-9]+\.[0-9]+(?:\.[0-9]+)?)/);
	if (genericMatch?.[1]) {
		return genericMatch[1];
	}
	return null;
};

export const isVersionOlder = (running: string, pinned: string): boolean => {
	const parseParts = (v: string) => {
		const clean = v.replace(/^v/, "").split("-")[0] || "";
		return clean.split(".").map((n) => Number.parseInt(n, 10) || 0);
	};
	const [rMajor = 0, rMinor = 0, rPatch = 0] = parseParts(running);
	const [pMajor = 0, pMinor = 0, pPatch = 0] = parseParts(pinned);

	if (rMajor !== pMajor) return rMajor < pMajor;
	if (rMinor !== pMinor) return rMinor < pMinor;
	return rPatch < pPatch;
};

export interface TraefikVersionInfo {
	pinnedVersion: string;
	runningVersion: string | null;
	runningImage: string | null;
	isOutdated: boolean;
}

export const computeTraefikVersionInfo = (
	runningImage: string | null,
	pinnedVersion: string,
): TraefikVersionInfo => {
	const runningVersion = parseTraefikVersion(runningImage);

	let isOutdated = false;
	if (runningVersion && pinnedVersion) {
		isOutdated = isVersionOlder(runningVersion, pinnedVersion);
	}

	return {
		pinnedVersion,
		runningVersion,
		runningImage,
		isOutdated,
	};
};

describe("Traefik Version Drift & Pinned Version Detection (#5221)", () => {
	describe("parseTraefikVersion", () => {
		it("should parse standard version with 'v' prefix", () => {
			expect(parseTraefikVersion("traefik:v3.6.25")).toBe("3.6.25");
		});

		it("should parse version without 'v' prefix", () => {
			expect(parseTraefikVersion("traefik:3.6.25")).toBe("3.6.25");
		});

		it("should parse version with registry prefix", () => {
			expect(parseTraefikVersion("docker.io/library/traefik:v3.1.2")).toBe(
				"3.1.2",
			);
		});

		it("should parse version with sha256 digest suffix", () => {
			expect(
				parseTraefikVersion(
					"traefik:v3.1.0@sha256:72c8ff4d320958ffbf9919f2a24c2979ab332ff09",
				),
			).toBe("3.1.0");
		});

		it("should parse version with prerelease tag", () => {
			expect(parseTraefikVersion("traefik:v3.0.0-rc1")).toBe("3.0.0-rc1");
		});

		it("should return null for invalid or missing image names", () => {
			expect(parseTraefikVersion(null)).toBeNull();
			expect(parseTraefikVersion(undefined)).toBeNull();
			expect(parseTraefikVersion("")).toBeNull();
			expect(parseTraefikVersion("nginx:latest")).toBeNull();
		});
	});

	describe("isVersionOlder", () => {
		it("should correctly identify older minor and patch versions", () => {
			expect(isVersionOlder("3.1.2", "3.6.25")).toBe(true);
			expect(isVersionOlder("3.6.24", "3.6.25")).toBe(true);
			expect(isVersionOlder("2.11.0", "3.0.0")).toBe(true);
		});

		it("should return false when versions are equal", () => {
			expect(isVersionOlder("3.6.25", "3.6.25")).toBe(false);
			expect(isVersionOlder("v3.6.25", "3.6.25")).toBe(false);
		});

		it("should return false when running version is newer", () => {
			expect(isVersionOlder("3.7.0", "3.6.25")).toBe(false);
			expect(isVersionOlder("4.0.0", "3.6.25")).toBe(false);
		});
	});

	describe("computeTraefikVersionInfo", () => {
		const PINNED = "3.6.25";

		it("should flag older running container as outdated", () => {
			const info = computeTraefikVersionInfo("traefik:v3.1.2", PINNED);
			expect(info).toEqual({
				pinnedVersion: PINNED,
				runningVersion: "3.1.2",
				runningImage: "traefik:v3.1.2",
				isOutdated: true,
			});
		});

		it("should not flag running container on same version as outdated", () => {
			const info = computeTraefikVersionInfo("traefik:v3.6.25", PINNED);
			expect(info).toEqual({
				pinnedVersion: PINNED,
				runningVersion: "3.6.25",
				runningImage: "traefik:v3.6.25",
				isOutdated: false,
			});
		});

		it("should not flag newer running container as outdated", () => {
			const info = computeTraefikVersionInfo("traefik:v3.7.0", PINNED);
			expect(info).toEqual({
				pinnedVersion: PINNED,
				runningVersion: "3.7.0",
				runningImage: "traefik:v3.7.0",
				isOutdated: false,
			});
		});

		it("should handle null runningImage gracefully when container does not exist", () => {
			const info = computeTraefikVersionInfo(null, PINNED);
			expect(info).toEqual({
				pinnedVersion: PINNED,
				runningVersion: null,
				runningImage: null,
				isOutdated: false,
			});
		});

		it("should handle digest-pinned running images correctly", () => {
			const info = computeTraefikVersionInfo(
				"docker.io/traefik:v3.2.0@sha256:abc123def456",
				PINNED,
			);
			expect(info.isOutdated).toBe(true);
			expect(info.runningVersion).toBe("3.2.0");
		});
	});
});
