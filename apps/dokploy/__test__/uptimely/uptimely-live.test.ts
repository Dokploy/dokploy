import {
	createUptimelyClient,
	UptimelyError,
} from "@dokploy/server/utils/uptimely/client";
import { describe, expect, it } from "vitest";

/**
 * Live, non-mocked check of the Code Mode client against the real Uptimely MCP
 * server. Skipped unless `UPTIMELY_LIVE_TEST_KEY` is set:
 *
 *   UPTIMELY_LIVE_TEST_KEY=<project api key>
 *   UPTIMELY_LIVE_PROJECT_ID=<project id the key can access>
 *   UPTIMELY_LIVE_BASE_URL=<optional, defaults to https://app.getuptimely.com>
 *
 * Read-only on purpose: it never creates, changes, or probes anything.
 */

const KEY = process.env.UPTIMELY_LIVE_TEST_KEY;
const PROJECT_ID = process.env.UPTIMELY_LIVE_PROJECT_ID;
const BASE_URL =
	process.env.UPTIMELY_LIVE_BASE_URL ?? "https://app.getuptimely.com";

describe.skipIf(!KEY)("uptimely live (read-only)", () => {
	const client = () =>
		createUptimelyClient({ baseUrl: BASE_URL, apiKey: KEY as string });

	it("test connection: lists the projects the key can access", async () => {
		const result = await client().callTool<{
			projects: { id: string; name: string; slug: string }[];
			defaultProjectId: string | null;
		}>("uptimely_project_list");
		expect(Array.isArray(result.projects)).toBe(true);
		expect(result.projects.length).toBeGreaterThan(0);
		for (const project of result.projects) {
			expect(typeof project.id).toBe("string");
			expect(typeof project.name).toBe("string");
		}
		if (PROJECT_ID) {
			expect(result.projects.map((p) => p.id)).toContain(PROJECT_ID);
		}
	}, 30_000);

	it.skipIf(!PROJECT_ID)(
		"lists the status pages of the project",
		async () => {
			const result = await client().callTool<{
				projectId: string;
				count: number;
				statusPages: { id: string; name: string; slug: string }[];
			}>("uptimely_status_page_list", { projectId: PROJECT_ID });
			expect(result.projectId).toBe(PROJECT_ID);
			expect(Array.isArray(result.statusPages)).toBe(true);
			expect(result.statusPages.length).toBe(result.count);
		},
		30_000,
	);

	it.skipIf(!PROJECT_ID)(
		"lists the monitors of the project",
		async () => {
			const result = await client().callTool<{
				monitors: { id: string; name: string; monitorType: string }[];
			}>("uptimely_monitor_list", { projectId: PROJECT_ID, limit: 5 });
			expect(Array.isArray(result.monitors)).toBe(true);
		},
		30_000,
	);

	it("maps a denied project to PROJECT_ACCESS_DENIED", async () => {
		const error = await client()
			.callTool("uptimely_status_page_list", {
				projectId: "00000000-0000-0000-0000-000000000000",
			})
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(UptimelyError);
		expect((error as UptimelyError).code).toBe("PROJECT_ACCESS_DENIED");
	}, 30_000);

	it("rejects a bad API key", async () => {
		const bad = createUptimelyClient({
			baseUrl: BASE_URL,
			apiKey: "uptimely-live-test-invalid-key",
		});
		await expect(bad.callTool("uptimely_project_list")).rejects.toBeInstanceOf(
			UptimelyError,
		);
	}, 30_000);
});
