import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	bucketDeploymentsByDay,
	type DeploymentStatus,
	getActivityWindowStart,
	watchLocalDay,
} from "@/components/dashboard/home/deployment-activity";

// Dates are built with the local-time constructor so the assertions hold in
// whatever timezone the test runner uses, mirroring the browser's bucketing.
const local = (
	month: number,
	day: number,
	hours = 12,
	minutes = 0,
	seconds = 0,
	ms = 0,
) => new Date(2026, month - 1, day, hours, minutes, seconds, ms);

const deployment = (createdAt: Date, status: DeploymentStatus | null) => ({
	createdAt: createdAt.toISOString(),
	status,
});

const now = local(10, 21, 15, 30);

describe("getActivityWindowStart", () => {
	it("starts at local midnight six days before today for a 7-day window", () => {
		expect(getActivityWindowStart(now, 7)).toEqual(local(10, 15, 0));
	});

	it("starts at midnight today for a 1-day window", () => {
		expect(getActivityWindowStart(now, 1)).toEqual(local(10, 21, 0));
	});
});

describe("bucketDeploymentsByDay", () => {
	it("returns seven zero-filled days, oldest first, when there are no deployments", () => {
		const { days, total } = bucketDeploymentsByDay([], now);

		expect(total).toBe(0);
		expect(days.map((d) => d.date)).toEqual([
			"2026-10-15",
			"2026-10-16",
			"2026-10-17",
			"2026-10-18",
			"2026-10-19",
			"2026-10-20",
			"2026-10-21",
		]);
		for (const day of days) {
			expect(day).toMatchObject({
				done: 0,
				error: 0,
				running: 0,
				cancelled: 0,
				total: 0,
			});
		}
	});

	it("zero-fills the gaps between days that have deployments", () => {
		const { days } = bucketDeploymentsByDay(
			[deployment(local(10, 15), "done"), deployment(local(10, 21), "done")],
			now,
		);

		expect(days.map((d) => d.total)).toEqual([1, 0, 0, 0, 0, 0, 1]);
	});

	it("counts each status on its own line", () => {
		const { days, total } = bucketDeploymentsByDay(
			[
				deployment(local(10, 20, 9), "done"),
				deployment(local(10, 20, 10), "done"),
				deployment(local(10, 20, 11), "error"),
				deployment(local(10, 20, 12), "cancelled"),
				deployment(local(10, 20, 13), "running"),
			],
			now,
		);

		expect(total).toBe(5);
		expect(days.find((d) => d.date === "2026-10-20")).toEqual({
			date: "2026-10-20",
			done: 2,
			error: 1,
			running: 1,
			cancelled: 1,
			total: 5,
		});
	});

	it("treats a null status as running, matching the column default", () => {
		const { days } = bucketDeploymentsByDay(
			[deployment(local(10, 21, 8), null)],
			now,
		);

		expect(days.at(-1)).toMatchObject({ running: 1, total: 1 });
	});

	it("places deployments on either side of local midnight in different days", () => {
		const { days } = bucketDeploymentsByDay(
			[
				deployment(local(10, 19, 23, 59, 59, 999), "done"),
				deployment(local(10, 20, 0, 0, 0, 0), "error"),
			],
			now,
		);

		expect(days.find((d) => d.date === "2026-10-19")).toMatchObject({
			done: 1,
			total: 1,
		});
		expect(days.find((d) => d.date === "2026-10-20")).toMatchObject({
			error: 1,
			total: 1,
		});
	});

	it("includes the first instant of the window and excludes the one before it", () => {
		const { total, days } = bucketDeploymentsByDay(
			[
				deployment(local(10, 14, 23, 59, 59, 999), "done"),
				deployment(local(10, 15, 0, 0, 0, 0), "done"),
			],
			now,
		);

		expect(total).toBe(1);
		expect(days[0]).toMatchObject({ date: "2026-10-15", total: 1 });
	});

	it("total matches the Deploys / 7d card: every deployment since the window start", () => {
		const deployments = [
			deployment(local(10, 1), "done"),
			deployment(local(10, 14, 22), "error"),
			deployment(local(10, 15, 0, 0, 0, 1), "done"),
			deployment(local(10, 17), "cancelled"),
			deployment(local(10, 18), "error"),
			deployment(local(10, 21, 15), "running"),
		];
		const windowStart = getActivityWindowStart(now).getTime();
		const cardCount = deployments.filter(
			(d) => new Date(d.createdAt).getTime() >= windowStart,
		).length;

		const { days, total } = bucketDeploymentsByDay(deployments, now);

		expect(total).toBe(cardCount);
		expect(total).toBe(4);
		expect(days.reduce((sum, d) => sum + d.total, 0)).toBe(total);
		expect(
			days.reduce(
				(sum, d) => sum + d.done + d.error + d.running + d.cancelled,
				0,
			),
		).toBe(total);
	});

	it("supports windows other than seven days", () => {
		const { days } = bucketDeploymentsByDay([], now, 30);

		expect(days).toHaveLength(30);
		expect(days[0]?.date).toBe("2026-09-22");
		expect(days.at(-1)?.date).toBe("2026-10-21");
	});
});

describe("day rollover with unchanged deployments", () => {
	// Mirrors ShowHome: polling keeps the same array reference, so only the
	// local-day trigger from watchLocalDay can move the window forward.
	const deployments = Object.freeze([
		deployment(local(10, 15, 9), "done"),
		deployment(local(10, 18, 9), "error"),
		deployment(local(10, 21, 9), "done"),
	]);

	let stop: (() => void) | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(local(10, 21, 23, 59, 0));
	});

	afterEach(() => {
		stop?.();
		vi.useRealTimers();
	});

	it("moves the window forward at local midnight without new data", () => {
		let today = local(10, 21, 0);
		let activity = bucketDeploymentsByDay(deployments, today);
		const onDayChange = vi.fn((day: Date) => {
			today = day;
			activity = bucketDeploymentsByDay(deployments, today);
		});
		stop = watchLocalDay(onDayChange);

		expect(activity.days[0]?.date).toBe("2026-10-15");
		expect(activity.total).toBe(3);

		vi.advanceTimersByTime(59_999);
		expect(onDayChange).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(onDayChange).toHaveBeenCalledTimes(1);
		expect(today).toEqual(local(10, 22, 0));
		expect(activity.days.map((d) => d.date)).toEqual([
			"2026-10-16",
			"2026-10-17",
			"2026-10-18",
			"2026-10-19",
			"2026-10-20",
			"2026-10-21",
			"2026-10-22",
		]);
		expect(activity.total).toBe(2);
		expect(activity.days.at(-1)).toMatchObject({ total: 0 });
	});

	it("keeps firing on each following midnight", () => {
		const onDayChange = vi.fn();
		stop = watchLocalDay(onDayChange);

		vi.advanceTimersByTime(60_000);
		vi.advanceTimersByTime(24 * 60 * 60 * 1000);

		expect(onDayChange.mock.calls.map(([day]) => day)).toEqual([
			local(10, 22, 0),
			local(10, 23, 0),
		]);
	});

	it("stops firing after cleanup", () => {
		const onDayChange = vi.fn();
		watchLocalDay(onDayChange)();

		vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);

		expect(onDayChange).not.toHaveBeenCalled();
	});
});
