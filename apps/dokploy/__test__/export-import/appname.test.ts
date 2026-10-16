import {
	regenerateAppName,
	replaceAppNames,
	rewriteSslipIoIp,
	rewriteVolumeName,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

describe("regenerateAppName", () => {
	it("strips the last hyphen segment and rebuilds a fresh suffix", () => {
		const result = regenerateAppName("application", "myapp-verb-noun-ab12cd");
		expect(result).not.toBe("myapp-verb-noun-ab12cd");
		expect(result.startsWith("myapp-verb-noun-")).toBe(true);
	});

	it("handles an app name with no hyphen", () => {
		const result = regenerateAppName("application", "singleword");
		expect(result.startsWith("singleword-")).toBe(true);
	});

	it("produces a different name on every call", () => {
		const first = regenerateAppName("application", "myapp-verb-noun-ab12cd");
		const second = regenerateAppName("application", "myapp-verb-noun-ab12cd");
		expect(first).not.toBe(second);
	});
});

describe("replaceAppNames", () => {
	it("replaces a standalone app name reference", () => {
		const result = replaceAppNames("DEPLOY_TARGET=app-foo ready", {
			"app-foo": "app-bar",
		});
		expect(result).toBe("DEPLOY_TARGET=app-bar ready");
	});

	it("does not touch a key that only matches mid-token (left boundary)", () => {
		const result = replaceAppNames("myapp-foo deployed", { foo: "bar" });
		expect(result).toBe("myapp-foo deployed");
	});

	it("prefers the longest match when both names are in the map (prefix collision)", () => {
		const result = replaceAppNames("app-foo-bar and app-foo both here", {
			"app-foo": "short-renamed",
			"app-foo-bar": "long-renamed",
		});
		expect(result).toBe("long-renamed and short-renamed both here");
	});

	it("returns the text unchanged when the map is empty", () => {
		expect(replaceAppNames("app-foo", {})).toBe("app-foo");
	});

	it("returns null/empty text unchanged", () => {
		expect(replaceAppNames("", { "app-foo": "app-bar" })).toBe("");
	});
});

describe("rewriteVolumeName", () => {
	it("reports rewritten: true when the name changes", () => {
		const result = rewriteVolumeName("app-foo-data", {
			"app-foo": "app-bar",
		});
		expect(result).toEqual({ value: "app-bar-data", rewritten: true });
	});

	it("reports rewritten: false when nothing matches", () => {
		const result = rewriteVolumeName("unrelated-volume", {
			"app-foo": "app-bar",
		});
		expect(result).toEqual({ value: "unrelated-volume", rewritten: false });
	});
});

describe("rewriteSslipIoIp", () => {
	it("swaps the trailing IP segment of an auto-generated sslip.io host for the destination's IP", () => {
		const result = rewriteSslipIoIp(
			"my-app-ab12cd-10-0-0-5.sslip.io",
			"203.0.113.9",
		);
		expect(result).toBe("my-app-ab12cd-203-0-113-9.sslip.io");
	});

	it("leaves a non-sslip.io host untouched", () => {
		const result = rewriteSslipIoIp("api.example.com", "203.0.113.9");
		expect(result).toBe("api.example.com");
	});

	it("leaves the host untouched when no destination IP is known", () => {
		const result = rewriteSslipIoIp("my-app-ab12cd-10-0-0-5.sslip.io", null);
		expect(result).toBe("my-app-ab12cd-10-0-0-5.sslip.io");
	});
});
