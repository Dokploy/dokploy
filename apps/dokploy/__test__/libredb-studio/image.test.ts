import { LIBREDB_STUDIO_DEFAULT_IMAGE } from "@dokploy/server/utils/libredb-studio/constants";
import {
	isBelowMinimumStudioVersion,
	isStudioImageUpdateAvailable,
	parseStudioImageVersion,
} from "@dokploy/server/utils/libredb-studio/image";
import { describe, expect, it } from "vitest";

describe("parseStudioImageVersion", () => {
	it.each([
		["ghcr.io/libredb/libredb-studio:0.18.0", "0.18.0"],
		["ghcr.io/libredb/libredb-studio:0.18.0-alpine", "0.18.0"],
		["ghcr.io/libredb/libredb-studio:0.18.0-alpine-slim", "0.18.0"],
		["libredb/libredb-studio:0.17.0", "0.17.0"],
		["localhost:5000/libredb-studio:1.2.3", "1.2.3"],
		["  ghcr.io/libredb/libredb-studio:0.19.4  ", "0.19.4"],
		["ghcr.io/libredb/libredb-studio:0.18.0-rc.1", "0.18.0-rc.1"],
		["ghcr.io/libredb/libredb-studio:0.18.0-rc.1-alpine", "0.18.0-rc.1"],
		["ghcr.io/libredb/libredb-studio:0.18.0-beta-alpine-slim", "0.18.0-beta"],
	])("reads the release from %s", (image, version) => {
		expect(parseStudioImageVersion(image)).toBe(version);
	});

	it.each([
		["ghcr.io/libredb/libredb-studio:latest"],
		["ghcr.io/libredb/libredb-studio:latest-alpine"],
		["ghcr.io/libredb/libredb-studio:main"],
		["ghcr.io/libredb/libredb-studio:sha-1a2b3c4"],
		["ghcr.io/libredb/libredb-studio:sha-1a2b3c4-alpine"],
		["ghcr.io/libredb/libredb-studio@sha256:0123456789abcdef"],
		["ghcr.io/libredb/libredb-studio:0.18.0@sha256:0123456789abcdef"],
		["ghcr.io/libredb/libredb-studio"],
		["localhost:5000/libredb-studio"],
		["ghcr.io/libredb/libredb-studio:0.18"],
		["ghcr.io/libredb/libredb-studio:01.2.3"],
		["ghcr.io/libredb/libredb-studio:v0.18.0"],
		["ghcr.io/libredb/libredb-studio:0.18.0-rc.01"],
		["ghcr.io/libredb/libredb-studio:0.18.0-"],
		[""],
		[null],
		[undefined],
	])("returns null for %s", (image) => {
		expect(parseStudioImageVersion(image)).toBeNull();
	});
});

describe("isBelowMinimumStudioVersion", () => {
	it("is true for a release older than the minimum", () => {
		expect(
			isBelowMinimumStudioVersion("ghcr.io/libredb/libredb-studio:0.17.0"),
		).toBe(true);
		expect(
			isBelowMinimumStudioVersion(
				"ghcr.io/libredb/libredb-studio:0.9.59-alpine",
			),
		).toBe(true);
	});

	it("is false for the minimum release and newer ones", () => {
		expect(
			isBelowMinimumStudioVersion("ghcr.io/libredb/libredb-studio:0.18.0"),
		).toBe(false);
		expect(
			isBelowMinimumStudioVersion("ghcr.io/libredb/libredb-studio:0.18.1"),
		).toBe(false);
		expect(
			isBelowMinimumStudioVersion("ghcr.io/libredb/libredb-studio:1.0.0"),
		).toBe(false);
	});

	it("is true for a prerelease of the minimum, which semver orders before it", () => {
		expect(
			isBelowMinimumStudioVersion("ghcr.io/libredb/libredb-studio:0.18.0-rc.1"),
		).toBe(true);
		expect(
			isBelowMinimumStudioVersion(
				"ghcr.io/libredb/libredb-studio:0.18.0-rc.1-alpine",
			),
		).toBe(true);
	});

	it("is false when the version cannot be read", () => {
		expect(
			isBelowMinimumStudioVersion("ghcr.io/libredb/libredb-studio:latest"),
		).toBe(false);
		expect(isBelowMinimumStudioVersion(null)).toBe(false);
	});

	it("never flags the pinned default image", () => {
		expect(
			parseStudioImageVersion(LIBREDB_STUDIO_DEFAULT_IMAGE),
		).not.toBeNull();
		expect(isBelowMinimumStudioVersion(LIBREDB_STUDIO_DEFAULT_IMAGE)).toBe(
			false,
		);
	});
});

describe("isStudioImageUpdateAvailable", () => {
	const recommended = "ghcr.io/libredb/libredb-studio:0.18.0";

	it.each([
		["an older release", "ghcr.io/libredb/libredb-studio:0.17.0"],
		[
			"an older release variant",
			"ghcr.io/libredb/libredb-studio:0.17.2-alpine",
		],
		[
			"a prerelease of the recommended release",
			"ghcr.io/libredb/libredb-studio:0.18.0-rc.1",
		],
	])("offers the update for %s", (_name, image) => {
		expect(isStudioImageUpdateAvailable(image, recommended)).toBe(true);
	});

	it.each([
		["the recommended image", recommended],
		[
			"a variant of the recommended release",
			"ghcr.io/libredb/libredb-studio:0.18.0-alpine",
		],
		["a newer release", "ghcr.io/libredb/libredb-studio:0.19.0"],
		[
			"a prerelease of a newer release",
			"ghcr.io/libredb/libredb-studio:0.19.0-rc.1",
		],
		[
			"a custom image with an older tag",
			"registry.example.com/team/studio-fork:0.17.0",
		],
		["an unparseable tag", "ghcr.io/libredb/libredb-studio:latest"],
		["a digest", "ghcr.io/libredb/libredb-studio@sha256:0123456789abcdef"],
		["no image", null],
	])("offers no update for %s", (_name, image) => {
		expect(isStudioImageUpdateAvailable(image, recommended)).toBe(false);
	});

	it("compares against a recommended image from a private registry", () => {
		expect(
			isStudioImageUpdateAvailable(
				"localhost:5000/libredb-studio:0.17.0",
				"localhost:5000/libredb-studio:0.18.0",
			),
		).toBe(true);
		expect(
			isStudioImageUpdateAvailable(
				"ghcr.io/libredb/libredb-studio:0.17.0",
				"localhost:5000/libredb-studio:0.18.0",
			),
		).toBe(false);
	});

	it("offers no update when the recommended version cannot be read", () => {
		expect(
			isStudioImageUpdateAvailable(
				"ghcr.io/libredb/libredb-studio:0.17.0",
				"ghcr.io/libredb/libredb-studio:latest",
			),
		).toBe(false);
	});
});
