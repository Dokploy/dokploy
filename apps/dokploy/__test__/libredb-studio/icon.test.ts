import { createHash } from "node:crypto";
import {
	LIBREDB_STUDIO_ICON_DATA_URL,
	LIBREDB_STUDIO_ICON_SVG,
} from "@dokploy/server/utils/libredb-studio/icon";
import { describe, expect, it } from "vitest";

// sha256 of src/app/icon.svg in the libredb-studio repository at fc28ef73e.
const STUDIO_ICON_SHA256 =
	"d65169b75cea47210e493bdabc14537e8b86c3bb080f8a228251643cf44da38a";

describe("LibreDB Studio icon", () => {
	it("is LibreDB Studio's own logo, byte for byte", () => {
		expect(LIBREDB_STUDIO_ICON_SVG).toMatch(
			/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink" width="64" height="64" viewBox="-25\.315 0 600 600">\n/,
		);
		expect(LIBREDB_STUDIO_ICON_SVG).toContain('id="libredb-brand-gradient"');
		expect(LIBREDB_STUDIO_ICON_SVG).toContain('id="libredb-accent-gradient"');
		expect(LIBREDB_STUDIO_ICON_SVG.endsWith("</svg>\n")).toBe(true);
		expect(
			createHash("sha256").update(LIBREDB_STUDIO_ICON_SVG).digest("hex"),
		).toBe(STUDIO_ICON_SHA256);
	});

	it("encodes the SVG as a base64 data URL that the application icon column accepts", () => {
		const prefix = "data:image/svg+xml;base64,";
		expect(LIBREDB_STUDIO_ICON_DATA_URL.startsWith(prefix)).toBe(true);
		expect(
			Buffer.from(
				LIBREDB_STUDIO_ICON_DATA_URL.slice(prefix.length),
				"base64",
			).toString("utf8"),
		).toBe(LIBREDB_STUDIO_ICON_SVG);
		expect(LIBREDB_STUDIO_ICON_DATA_URL.length).toBeLessThan(2 * 1024 * 1024);
	});
});
