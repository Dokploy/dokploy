import {
	aggregateProjectContainerStats,
	findBestMatchingService,
	getContainerServiceMatchScore,
	type ProjectServiceRef,
	parseDockerSizeToBytes,
} from "@dokploy/server/monitoring/project-stats";
import { describe, expect, it } from "vitest";

const application = (
	overrides: Partial<ProjectServiceRef> = {},
): ProjectServiceRef => ({
	id: "application-1",
	name: "Web",
	appName: "web-app",
	type: "application",
	serverId: "server-1",
	...overrides,
});

describe("project monitoring stats", () => {
	it("parses Docker sizes and rejects invalid values", () => {
		expect(parseDockerSizeToBytes("1.5GiB")).toBe(1.5 * 1024 ** 3);
		expect(parseDockerSizeToBytes("--")).toBe(0);
		expect(parseDockerSizeToBytes("not-a-size")).toBe(0);
	});

	it("matches containers to the most specific service on the same server", () => {
		const broad = application({ id: "broad", appName: "web" });
		const specific = application({ id: "specific", appName: "web-app" });

		expect(getContainerServiceMatchScore("web-app_api_1", "web-app")).toBe(
			"web-app".length,
		);
		expect(
			findBestMatchingService("web-app_api_1", [broad, specific], "server-1")
				?.id,
		).toBe("specific");
		expect(
			findBestMatchingService("web-app_api_1", [specific], "server-2"),
		).toBeUndefined();
	});

	it("aggregates only containers owned by allowed services", () => {
		const services = [application()];
		const result = aggregateProjectContainerStats(services, [
			{
				BlockIO: "1MB / 2MB",
				CPUPerc: "12.5%",
				Container: "container-1",
				ID: "container-1",
				MemPerc: "10%",
				MemUsage: "128MiB / 1GiB",
				Name: "web-app_api_1",
				NetIO: "3MB / 4MB",
				serverId: "server-1",
			},
			{
				BlockIO: "10MB / 10MB",
				CPUPerc: "90%",
				Container: "other",
				ID: "other",
				MemPerc: "90%",
				MemUsage: "900MiB / 1GiB",
				Name: "unrelated_service_1",
				NetIO: "10MB / 10MB",
				serverId: "server-1",
			},
		]);

		expect(result.aggregated.cpu.value).toBe("12.50%");
		expect(result.services[0]).toMatchObject({
			containerCount: 1,
			cpuPerc: 12.5,
			memUsed: "128.00MiB",
		});
	});
});
