import { snapvisorApiUrl } from "@dokploy/server/utils/snapvisor/client";
import {
	normalizeSnapvisorApiBaseUrl,
	SNAPVISOR_DEFAULT_BASE_URL,
	SNAPVISOR_WEB_URL,
	snapvisorWebBaseUrl,
} from "@dokploy/server/utils/snapvisor/urls";
import { describe, expect, it } from "vitest";

describe("snapvisor hosts", () => {
	it("defaults the API base URL to the API host, not the web app", () => {
		expect(SNAPVISOR_DEFAULT_BASE_URL).toBe("https://api.snapvisor.io");
		expect(SNAPVISOR_WEB_URL).toBe("https://app.snapvisor.io");
	});
});

describe("normalizeSnapvisorApiBaseUrl", () => {
	it("maps the legacy web-app host to the API host", () => {
		expect(normalizeSnapvisorApiBaseUrl("https://app.snapvisor.io")).toBe(
			"https://api.snapvisor.io",
		);
		expect(normalizeSnapvisorApiBaseUrl("https://app.snapvisor.io/")).toBe(
			"https://api.snapvisor.io",
		);
	});

	it("leaves the API host and custom hosts untouched (minus trailing slash)", () => {
		expect(normalizeSnapvisorApiBaseUrl("https://api.snapvisor.io/")).toBe(
			"https://api.snapvisor.io",
		);
		expect(normalizeSnapvisorApiBaseUrl("https://sv.internal.example")).toBe(
			"https://sv.internal.example",
		);
		// Only the exact web-app origin is rewritten, not a path under it.
		expect(normalizeSnapvisorApiBaseUrl("https://app.snapvisor.io/api")).toBe(
			"https://app.snapvisor.io/api",
		);
	});
});

describe("snapvisorApiUrl", () => {
	it("targets the API host for a legacy stored app.snapvisor.io base URL", () => {
		expect(snapvisorApiUrl("https://app.snapvisor.io")).toBe(
			"https://api.snapvisor.io/v2",
		);
		expect(snapvisorApiUrl("https://api.snapvisor.io/")).toBe(
			"https://api.snapvisor.io/v2",
		);
	});
});

describe("snapvisorWebBaseUrl", () => {
	it("maps API and legacy hosts to the web app", () => {
		expect(snapvisorWebBaseUrl("https://api.snapvisor.io")).toBe(
			"https://app.snapvisor.io",
		);
		expect(snapvisorWebBaseUrl("https://app.snapvisor.io/")).toBe(
			"https://app.snapvisor.io",
		);
	});

	it("keeps a custom host as-is", () => {
		expect(snapvisorWebBaseUrl("https://sv.internal.example/")).toBe(
			"https://sv.internal.example",
		);
	});
});
