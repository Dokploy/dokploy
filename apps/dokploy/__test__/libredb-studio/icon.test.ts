import {
	LIBREDB_STUDIO_ICON_DATA_URL,
	LIBREDB_STUDIO_ICON_SVG,
} from "@dokploy/server/utils/libredb-studio/icon";
import { describe, expect, it } from "vitest";

describe("LibreDB Studio icon", () => {
	it("is a one-color hexagon with code brackets in lucide's stroke style", () => {
		expect(LIBREDB_STUDIO_ICON_SVG).toContain('viewBox="0 0 24 24"');
		expect(LIBREDB_STUDIO_ICON_SVG).toContain('fill="none"');
		expect(LIBREDB_STUDIO_ICON_SVG).toContain('stroke="#71717a"');
		expect(LIBREDB_STUDIO_ICON_SVG).toContain('stroke-width="2"');
		expect(LIBREDB_STUDIO_ICON_SVG.match(/<path/g)).toHaveLength(3);
		expect(
			[...LIBREDB_STUDIO_ICON_SVG.matchAll(/<path d="([^"]*)"/g)].map(
				(match) => match[1],
			),
		).toEqual([
			"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
			"M10 9.5 8 12l2 2.5",
			"m14 9.5 2 2.5-2 2.5",
		]);
	});

	it("uses no color but the muted foreground gray", () => {
		expect(LIBREDB_STUDIO_ICON_SVG.match(/#[0-9a-fA-F]{3,8}\b/g)).toEqual([
			"#71717a",
		]);
		expect(LIBREDB_STUDIO_ICON_SVG).not.toContain("gradient");
		expect(LIBREDB_STUDIO_ICON_SVG).not.toContain("url(");
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
