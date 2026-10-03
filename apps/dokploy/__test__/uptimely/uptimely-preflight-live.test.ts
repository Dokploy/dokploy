import { checkUrl } from "@dokploy/server/utils/uptimely/preflight";
import { describe, expect, it } from "vitest";

/**
 * Live, non-mocked preflight against the real internet. Skipped unless
 * `UPTIMELY_PREFLIGHT_LIVE` is set:
 *
 *   UPTIMELY_PREFLIGHT_LIVE=1 npx vitest run --config __test__/vitest.config.ts __test__/uptimely/uptimely-preflight-live
 *
 * openrouter.devino.ca is an API that answers 404 at `/`, which is exactly
 * what makes Uptimely report a new monitor Offline.
 */
describe.skipIf(!process.env.UPTIMELY_PREFLIGHT_LIVE)("preflight live", () => {
	it("flags an API that answers 404 at /", async () => {
		const result = await checkUrl("https://openrouter.devino.ca/");
		expect(result.status).toBe(404);
		expect(result.ok).toBe(false);
	}, 30_000);

	it("passes a site that answers 200", async () => {
		const result = await checkUrl("https://dokploy-community.devino.ca/");
		expect(result.ok).toBe(true);
		expect(result.status).toBeGreaterThanOrEqual(200);
		expect(result.status).toBeLessThan(400);
	}, 30_000);
});
