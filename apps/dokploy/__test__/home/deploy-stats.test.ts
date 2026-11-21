import { describe, expect, it } from "vitest";
import { computeDeployStats } from "@/components/dashboard/home/deploy-stats";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);

const daysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

describe("computeDeployStats", () => {
	it("returns zero with no activity yet when there are no deployments", () => {
		expect(computeDeployStats([], NOW)).toEqual({
			value: "0",
			delta: "no activity yet",
		});
		expect(computeDeployStats(undefined, NOW)).toEqual({
			value: "0",
			delta: "no activity yet",
		});
	});

	it("returns exact count and 'no prior data' for a brand-new service under the cap", () => {
		const deployments = [1, 2, 3, 4, 5].map((d) => ({
			applicationId: "app-1",
			createdAt: daysAgo(d),
		}));

		expect(computeDeployStats(deployments, NOW)).toEqual({
			value: "5",
			delta: "no prior data",
		});
	});

	it("computes exact count and percentage delta when service history is unpruned", () => {
		const deployments = [
			...[1, 2, 3, 4, 5, 6].map((d) => ({
				applicationId: "app-1",
				createdAt: daysAgo(d),
			})),
			...[8, 10, 12].map((d) => ({
				applicationId: "app-1",
				createdAt: daysAgo(d),
			})),
		];

		expect(computeDeployStats(deployments, NOW)).toEqual({
			value: "6",
			delta: "+100% vs prev 7d",
		});
	});

	it("keeps exact stats when a service has 10+ rows whose oldest spans past the 14-day window", () => {
		const deployments = [
			...[1, 3].map((d) => ({
				applicationId: "app-1",
				createdAt: daysAgo(d),
			})),
			...[8, 9, 11, 13].map((d) => ({
				applicationId: "app-1",
				createdAt: daysAgo(d),
			})),
			...[16, 20, 25, 30].map((d) => ({
				applicationId: "app-1",
				createdAt: daysAgo(d),
			})),
		];

		expect(computeDeployStats(deployments, NOW)).toEqual({
			value: "2",
			delta: "-50% vs prev 7d",
		});
	});

	it("marks count as a floor and shows capped-history note when a service hits 11 rows inside 14d (post-insert steady state)", () => {
		const deployments = [
			...[0.5, 1, 2, 3, 4, 4.5, 5, 6, 6.5].map((d) => ({
				applicationId: "app-1",
				createdAt: daysAgo(d),
			})),
			...[8.5, 9].map((d) => ({
				applicationId: "app-1",
				createdAt: daysAgo(d),
			})),
		];

		expect(computeDeployStats(deployments, NOW)).toEqual({
			value: "9+",
			delta: "capped at 10 per service",
		});
	});

	it("marks count as a floor and shows capped-history note when a service has exactly 10 deployments all inside the last 7d", () => {
		const deployments = Array.from({ length: 10 }, (_, i) => ({
			applicationId: "app-1",
			createdAt: daysAgo((i + 1) * 0.5),
		}));

		expect(computeDeployStats(deployments, NOW)).toEqual({
			value: "10+",
			delta: "capped at 10 per service",
		});
	});

	it("detects pruning for compose services and keeps application/compose namespaces distinct", () => {
		const appDeployments = Array.from({ length: 5 }, (_, i) => ({
			applicationId: "shared-id",
			createdAt: daysAgo(i + 1),
		}));
		const composeDeployments = Array.from({ length: 5 }, (_, i) => ({
			composeId: "shared-id",
			createdAt: daysAgo(i + 1),
		}));

		// 5 + 5 across two distinct services is below the per-service 10-row cap.
		expect(
			computeDeployStats([...appDeployments, ...composeDeployments], NOW),
		).toEqual({
			value: "10",
			delta: "no prior data",
		});

		const prunedCompose = Array.from({ length: 10 }, (_, i) => ({
			composeId: "compose-1",
			createdAt: daysAgo(i + 1),
		}));
		expect(computeDeployStats(prunedCompose, NOW)).toEqual({
			value: "7+",
			delta: "capped at 10 per service",
		});
	});

	it("flags the dashboard card if any service in the org has potentially pruned history", () => {
		const unprunedApp = [
			{ applicationId: "app-small", createdAt: daysAgo(2) },
			{ applicationId: "app-small", createdAt: daysAgo(9) },
		];
		const prunedApp = Array.from({ length: 11 }, (_, i) => ({
			applicationId: "app-busy",
			createdAt: daysAgo(i + 1),
		}));

		expect(computeDeployStats([...unprunedApp, ...prunedApp], NOW)).toEqual({
			value: "8+",
			delta: "capped at 10 per service",
		});
	});
});
