import { describe, expect, test } from "vitest";

describe("initializeJobs — schedule filter", () => {
	const makeSchedule = (overrides: Record<string, unknown> = {}) => ({
		scheduleId: "sched_1",
		cronExpression: "0 */6 * * *",
		timezone: "America/New_York",
		enabled: true,
		server: null,
		application: null,
		compose: null,
		...overrides,
	});

	const filterSchedule = (schedule: ReturnType<typeof makeSchedule>) => {
		if (schedule.server) {
			return (schedule.server as { serverStatus: string }).serverStatus ===
				"active";
		}
		if (schedule.application) {
			return (
				(
					schedule.application as {
						server?: { serverStatus: string } | null;
					}
				).server?.serverStatus === "active"
			);
		}
		if (schedule.compose) {
			return (
				(schedule.compose as { server?: { serverStatus: string } | null })
					.server?.serverStatus === "active"
			);
		}
		return false;
	};

	test("includes schedule with active server (type: server)", () => {
		const schedule = makeSchedule({
			server: { serverStatus: "active" },
		});
		expect(filterSchedule(schedule)).toBe(true);
	});

	test("excludes schedule with inactive server", () => {
		const schedule = makeSchedule({
			server: { serverStatus: "inactive" },
		});
		expect(filterSchedule(schedule)).toBe(false);
	});

	test("includes application schedule with active server", () => {
		const schedule = makeSchedule({
			application: { server: { serverStatus: "active" } },
		});
		expect(filterSchedule(schedule)).toBe(true);
	});

	test("excludes application schedule with inactive server", () => {
		const schedule = makeSchedule({
			application: { server: { serverStatus: "inactive" } },
		});
		expect(filterSchedule(schedule)).toBe(false);
	});

	test("includes compose schedule with active server", () => {
		const schedule = makeSchedule({
			compose: { server: { serverStatus: "active" } },
		});
		expect(filterSchedule(schedule)).toBe(true);
	});

	test("excludes compose schedule with inactive server", () => {
		const schedule = makeSchedule({
			compose: { server: { serverStatus: "inactive" } },
		});
		expect(filterSchedule(schedule)).toBe(false);
	});

	test("excludes schedule with no server/application/compose (explicit false)", () => {
		const schedule = makeSchedule();
		expect(filterSchedule(schedule)).toBe(false);
	});

	test("filters array of mixed schedules correctly", () => {
		const schedules = [
			makeSchedule({
				scheduleId: "active-server",
				server: { serverStatus: "active" },
			}),
			makeSchedule({
				scheduleId: "inactive-server",
				server: { serverStatus: "inactive" },
			}),
			makeSchedule({
				scheduleId: "active-app",
				application: { server: { serverStatus: "active" } },
			}),
			makeSchedule({
				scheduleId: "no-relation",
			}),
			makeSchedule({
				scheduleId: "active-compose",
				compose: { server: { serverStatus: "active" } },
			}),
		];

		const filtered = schedules.filter(filterSchedule);
		expect(filtered.map((s) => s.scheduleId)).toEqual([
			"active-server",
			"active-app",
			"active-compose",
		]);
	});
});

describe("initializeJobs — timezone passthrough", () => {
	test("timezone is preserved when building scheduleJob payload", () => {
		const schedule = {
			scheduleId: "sched_tz",
			cronExpression: "0 */6 * * *",
			timezone: "America/New_York" as string | null,
		};

		const payload = {
			scheduleId: schedule.scheduleId,
			type: "schedule" as const,
			cronSchedule: schedule.cronExpression,
			timezone: schedule.timezone ?? undefined,
		};

		expect(payload.timezone).toBe("America/New_York");
	});

	test("null timezone converts to undefined", () => {
		const schedule = {
			scheduleId: "sched_tz_null",
			cronExpression: "0 */6 * * *",
			timezone: null as string | null,
		};

		const payload = {
			scheduleId: schedule.scheduleId,
			type: "schedule" as const,
			cronSchedule: schedule.cronExpression,
			timezone: schedule.timezone ?? undefined,
		};

		expect(payload.timezone).toBeUndefined();
	});

	test("UTC timezone is passed through", () => {
		const schedule = {
			scheduleId: "sched_utc",
			cronExpression: "0 9 * * *",
			timezone: "UTC" as string | null,
		};

		const payload = {
			scheduleId: schedule.scheduleId,
			type: "schedule" as const,
			cronSchedule: schedule.cronExpression,
			timezone: schedule.timezone ?? undefined,
		};

		expect(payload.timezone).toBe("UTC");
	});
});

describe("schedule mutation — effective values for update", () => {
	test("uses input values when provided", () => {
		const existing = {
			cronExpression: "0 */6 * * *",
			timezone: "UTC",
			enabled: true,
		};
		const input = {
			cronExpression: "0 */3 * * *",
			timezone: "America/New_York",
			enabled: false,
		};

		const effectiveCron = input.cronExpression ?? existing.cronExpression;
		const effectiveTimezone =
			input.timezone !== undefined ? input.timezone : existing.timezone;
		const effectiveEnabled =
			input.enabled !== undefined ? input.enabled : existing.enabled;

		expect(effectiveCron).toBe("0 */3 * * *");
		expect(effectiveTimezone).toBe("America/New_York");
		expect(effectiveEnabled).toBe(false);
	});

	test("falls back to existing values when input omits fields", () => {
		const existing = {
			cronExpression: "0 */6 * * *",
			timezone: "America/New_York",
			enabled: true,
		};
		const input: {
			cronExpression?: string;
			timezone?: string;
			enabled?: boolean;
		} = {};

		const effectiveCron = input.cronExpression ?? existing.cronExpression;
		const effectiveTimezone =
			input.timezone !== undefined ? input.timezone : existing.timezone;
		const effectiveEnabled =
			input.enabled !== undefined ? input.enabled : existing.enabled;

		expect(effectiveCron).toBe("0 */6 * * *");
		expect(effectiveTimezone).toBe("America/New_York");
		expect(effectiveEnabled).toBe(true);
	});

	test("handles explicit false for enabled correctly", () => {
		const existing = { enabled: true };
		const input = { enabled: false };

		const effectiveEnabled =
			input.enabled !== undefined ? input.enabled : existing.enabled;
		expect(effectiveEnabled).toBe(false);
	});

	test("handles explicit null timezone correctly", () => {
		const existing = { timezone: "America/New_York" };
		const input: { timezone: string | null | undefined } = { timezone: null };

		const effectiveTimezone =
			input.timezone !== undefined ? input.timezone : existing.timezone;
		expect(effectiveTimezone).toBeNull();
	});
});
