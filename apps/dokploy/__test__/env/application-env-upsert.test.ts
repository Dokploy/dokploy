import { upsertApplicationEnvironment } from "@dokploy/server/services/application";
import { getApplicationEnvRevision } from "@dokploy/server/utils/env-upsert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
	const returning = vi.fn();
	const where = vi.fn(() => ({ returning }));
	const set = vi.fn(() => ({ where }));
	const update = vi.fn(() => ({ set }));
	const findFirst = vi.fn();

	return {
		findFirst,
		returning,
		set,
		update,
		where,
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: {
				findFirst: dbMocks.findFirst,
			},
		},
		update: dbMocks.update,
	},
}));

const mockApplication = (env: string | null = null) => ({
	applicationId: "app_1",
	env,
});

describe("upsertApplicationEnvironment", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dbMocks.returning.mockResolvedValue([mockApplication()]);
	});

	it("returns dry run metadata without saving raw values", async () => {
		dbMocks.findFirst.mockResolvedValue(
			mockApplication("API_URL=https://old.example.com\nREDIS_PASSWORD=old"),
		);

		const result = await upsertApplicationEnvironment({
			applicationId: "app_1",
			variables: {
				API_URL: "https://api.example.com",
				REDIS_PASSWORD: "new",
			},
			dryRun: true,
		});

		expect(dbMocks.update).not.toHaveBeenCalled();
		expect(result).toEqual({
			applicationId: "app_1",
			changed: true,
			revision: getApplicationEnvRevision(
				"app_1",
				"API_URL=https://old.example.com\nREDIS_PASSWORD=old",
			),
			dryRun: true,
			variables: [
				{
					name: "API_URL",
					action: "updated",
					secret: false,
				},
				{
					name: "REDIS_PASSWORD",
					action: "updated",
					secret: true,
				},
			],
		});
		expect(JSON.stringify(result)).not.toContain("new");
	});

	it("saves only the merged environment when the revision matches", async () => {
		const currentEnv = "API_URL=https://old.example.com\nREDIS_PASSWORD=old";
		dbMocks.findFirst.mockResolvedValue(mockApplication(currentEnv));

		const result = await upsertApplicationEnvironment({
			applicationId: "app_1",
			variables: {
				API_URL: "https://api.example.com",
				REDIS_HOST: "redis-dev",
			},
			expectedRevision: getApplicationEnvRevision("app_1", currentEnv),
		});

		expect(dbMocks.set).toHaveBeenCalledWith({
			env: "API_URL=https://api.example.com\nREDIS_PASSWORD=old\nREDIS_HOST=redis-dev",
		});
		expect(result.changed).toBe(true);
		expect(result.revision).toBe(
			getApplicationEnvRevision(
				"app_1",
				"API_URL=https://api.example.com\nREDIS_PASSWORD=old\nREDIS_HOST=redis-dev",
			),
		);
	});

	it("rejects stale expected revisions without writing", async () => {
		dbMocks.findFirst.mockResolvedValue(mockApplication("API_URL=https://old"));

		await expect(
			upsertApplicationEnvironment({
				applicationId: "app_1",
				variables: {
					API_URL: "https://api.example.com",
				},
				expectedRevision: "env:stale",
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "Application environment revision does not match",
		});
		expect(dbMocks.update).not.toHaveBeenCalled();
	});
});
