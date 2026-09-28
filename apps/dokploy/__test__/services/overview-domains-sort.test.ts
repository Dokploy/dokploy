import type { OverviewDomain } from "@dokploy/server/services/overview";
import { sortOverviewDomains } from "@dokploy/server/services/overview";
import { describe, expect, test } from "vitest";

const makeDomain = (overrides: Partial<OverviewDomain>): OverviewDomain => ({
	domainId: "id",
	host: "example.com",
	path: "/",
	port: 3000,
	customEntrypoint: null,
	https: true,
	certificateType: "letsencrypt",
	createdAt: "2024-01-01T00:00:00.000Z",
	enabled: true,
	domainType: "application",
	serviceOwnerId: "app",
	serviceOwnerType: "application",
	serviceName: "App",
	projectId: "project",
	projectName: "Project",
	environmentId: "environment",
	environmentName: "Environment",
	...overrides,
});

describe("sortOverviewDomains", () => {
	test("sorts by createdAt asc/desc", () => {
		const domains = [
			makeDomain({ domainId: "old", createdAt: "2023-01-01T00:00:00.000Z" }),
			makeDomain({ domainId: "new", createdAt: "2024-06-01T00:00:00.000Z" }),
			makeDomain({ domainId: "mid", createdAt: "2023-12-01T00:00:00.000Z" }),
		];

		expect(
			sortOverviewDomains(domains, "createdAt-asc").map((d) => d.domainId),
		).toEqual(["old", "mid", "new"]);
		expect(
			sortOverviewDomains(domains, "createdAt-desc").map((d) => d.domainId),
		).toEqual(["new", "mid", "old"]);
	});

	test("sorts by port asc/desc, with portless domains always last", () => {
		const domains = [
			makeDomain({ domainId: "none", port: null }),
			makeDomain({ domainId: "low", port: 80 }),
			makeDomain({ domainId: "high", port: 8080 }),
		];

		expect(
			sortOverviewDomains(domains, "port-asc").map((d) => d.domainId),
		).toEqual(["low", "high", "none"]);
		expect(
			sortOverviewDomains(domains, "port-desc").map((d) => d.domainId),
		).toEqual(["high", "low", "none"]);
	});

	test("port sort with all domains portless is a no-op", () => {
		const domains = [
			makeDomain({ domainId: "a", port: null }),
			makeDomain({ domainId: "b", port: null }),
		];

		expect(
			sortOverviewDomains(domains, "port-desc").map((d) => d.domainId),
		).toEqual(["a", "b"]);
	});

	test("does not mutate the input array", () => {
		const domains = [
			makeDomain({ domainId: "b", port: 8080 }),
			makeDomain({ domainId: "a", port: 80 }),
		];
		const original = [...domains];

		sortOverviewDomains(domains, "port-asc");

		expect(domains).toEqual(original);
	});
});
