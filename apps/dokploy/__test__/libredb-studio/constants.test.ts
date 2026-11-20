import {
	getLibreDBStudioImage,
	LIBREDB_STUDIO_CONFIG_DIR,
	LIBREDB_STUDIO_CONTAINER_UID,
	LIBREDB_STUDIO_DATA_DIR,
	LIBREDB_STUDIO_DEFAULT_IMAGE,
	LIBREDB_STUDIO_MIN_VERSION,
	LIBREDB_STUDIO_PORT,
	LIBREDB_STUDIO_SEED_FILE,
	LIBREDB_STUDIO_SEED_TTL_MS,
} from "@dokploy/server/utils/libredb-studio/constants";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("LibreDB Studio constants", () => {
	it("pins the Debian image of the minimum supported release", () => {
		expect(LIBREDB_STUDIO_DEFAULT_IMAGE).toBe(
			"ghcr.io/libredb/libredb-studio:0.18.0",
		);
		expect(LIBREDB_STUDIO_MIN_VERSION).toBe("0.18.0");
	});

	it("matches the container contract of the Studio image", () => {
		expect(LIBREDB_STUDIO_PORT).toBe(3000);
		expect(LIBREDB_STUDIO_CONFIG_DIR).toBe("/app/config");
		expect(LIBREDB_STUDIO_DATA_DIR).toBe("/app/data");
		expect(LIBREDB_STUDIO_SEED_FILE).toBe("seed-connections.json");
		expect(LIBREDB_STUDIO_SEED_TTL_MS).toBe(5000);
		expect(LIBREDB_STUDIO_CONTAINER_UID).toBe(1001);
	});
});

describe("getLibreDBStudioImage", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns the pinned image when LIBREDB_STUDIO_IMAGE is unset", () => {
		vi.stubEnv("LIBREDB_STUDIO_IMAGE", undefined);
		expect(getLibreDBStudioImage()).toBe(LIBREDB_STUDIO_DEFAULT_IMAGE);
	});

	it("returns the pinned image when LIBREDB_STUDIO_IMAGE is blank", () => {
		vi.stubEnv("LIBREDB_STUDIO_IMAGE", "   ");
		expect(getLibreDBStudioImage()).toBe(LIBREDB_STUDIO_DEFAULT_IMAGE);
	});

	it("returns the trimmed override when LIBREDB_STUDIO_IMAGE is set", () => {
		vi.stubEnv(
			"LIBREDB_STUDIO_IMAGE",
			"  localhost:5000/libredb-studio:0.18.0-rc.1 ",
		);
		expect(getLibreDBStudioImage()).toBe(
			"localhost:5000/libredb-studio:0.18.0-rc.1",
		);
	});
});
