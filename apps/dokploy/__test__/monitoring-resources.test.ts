import { describe, expect, it } from "vitest";
import buildMonitoringResources from "../utils/monitoring-resources";

describe("buildMonitoringResources", () => {
	it("returns empty array when projects is nullish", () => {
		expect(buildMonitoringResources(undefined)).toEqual([]);
		expect(buildMonitoringResources(null)).toEqual([]);
	});

	it("extracts applications, compose and databases into resources", () => {
		const projects = [
			{
				projectId: "p1",
				name: "Project One",
				environments: [
					{
						applications: [
							{ applicationId: "a1", appName: "app-a", name: "App A" },
						],
						compose: [
							{
								composeId: "c1",
								appName: "compose-a",
								name: "Compose A",
								composeType: "stack",
							},
						],
						postgres: [
							{ postgresId: "pg1", appName: "pg-a", name: "Postgres A" },
						],
						redis: [],
						mysql: [],
						mongo: [],
						mariadb: [],
					},
				],
			},
		];

		const resources = buildMonitoringResources(projects as any);

		// expect three resources created
		expect(resources).toHaveLength(3);

		const keys = resources.map((r) => r.key).sort();
		expect(keys).toEqual(
			["application-a1", "compose-c1", "postgres-pg1"].sort(),
		);

		const appResource = resources.find((r) => r.key === "application-a1");
		expect(appResource).toBeDefined();
		expect(appResource?.projectId).toBe("p1");
		expect(appResource?.projectName).toBe("Project One");
		expect(appResource?.appName).toBe("app-a");
		expect(appResource?.label).toBe("App A");

		const composeResource = resources.find((r) => r.key === "compose-c1");
		expect(composeResource?.appType).toBe("stack");

		expect(appResource?.label).toBe("App A");
	});
});
