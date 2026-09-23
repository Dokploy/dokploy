import { getOverviewServiceHref } from "@dokploy/server/services/overview-shared";
import { describe, expect, test } from "vitest";

const service = {
	id: "svc-1",
	projectId: "proj-1",
	environmentId: "env-1",
} as const;
const base = "/dashboard/project/proj-1/environment/env-1/services";

describe("getOverviewServiceHref", () => {
	test("links application/compose to the deployments tab with deployment.read", () => {
		expect(
			getOverviewServiceHref(
				{ ...service, type: "application" },
				{ canReadDeployments: true },
			),
		).toBe(`${base}/application/svc-1?tab=deployments`);
		expect(
			getOverviewServiceHref(
				{ ...service, type: "compose" },
				{ canReadDeployments: true },
			),
		).toBe(`${base}/compose/svc-1?tab=deployments`);
	});

	test("links application/compose to the service page without deployment.read", () => {
		expect(
			getOverviewServiceHref(
				{ ...service, type: "application" },
				{ canReadDeployments: false },
			),
		).toBe(`${base}/application/svc-1`);
		expect(
			getOverviewServiceHref(
				{ ...service, type: "compose" },
				{ canReadDeployments: false },
			),
		).toBe(`${base}/compose/svc-1`);
	});

	test("databases always link to their service page", () => {
		for (const type of [
			"postgres",
			"mysql",
			"mariadb",
			"mongo",
			"redis",
			"libsql",
		] as const) {
			for (const canReadDeployments of [true, false]) {
				expect(
					getOverviewServiceHref({ ...service, type }, { canReadDeployments }),
				).toBe(`${base}/${type}/svc-1`);
			}
		}
	});
});
