import { describe, expect, it } from "vitest";
import {
	isSavedApplicationEnvironment,
	mergeSavedApplicationEnvironment,
} from "../../components/dashboard/application/environment/cache";

describe("mergeSavedApplicationEnvironment", () => {
	it("keeps the committed environment fields when a stale query result exists", () => {
		const staleApplication = {
			env: "TIMEFRAME=151m",
			buildArgs: "OLD_ARG=1",
			buildSecrets: "OLD_SECRET=1",
			createEnvFile: false,
			name: "Kripto",
		};

		expect(
			mergeSavedApplicationEnvironment(staleApplication, {
				env: "TIMEFRAME=15m",
				buildArgs: "NEW_ARG=1",
				buildSecrets: "NEW_SECRET=1",
				createEnvFile: true,
			}),
		).toEqual({
			...staleApplication,
			env: "TIMEFRAME=15m",
			buildArgs: "NEW_ARG=1",
			buildSecrets: "NEW_SECRET=1",
			createEnvFile: true,
		});
	});

	it("preserves an absent cache entry", () => {
		expect(
			mergeSavedApplicationEnvironment(undefined, {
				env: "TIMEFRAME=15m",
				buildArgs: "",
				buildSecrets: "",
				createEnvFile: true,
			}),
		).toBeUndefined();
	});
});

describe("isSavedApplicationEnvironment", () => {
	it("rejects a stale poll result after a successful save", () => {
		expect(
			isSavedApplicationEnvironment(
				{
					env: "TIMEFRAME=151m",
					buildArgs: "",
					buildSecrets: "",
					createEnvFile: true,
				},
				{
					env: "TIMEFRAME=15m",
					buildArgs: "",
					buildSecrets: "",
					createEnvFile: true,
				},
			),
		).toBe(false);
	});
});
