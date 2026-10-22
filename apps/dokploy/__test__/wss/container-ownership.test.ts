import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindApp = vi.hoisted(() => vi.fn());
const mockFindLibsql = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/db", () => {
	const none = { findFirst: async () => undefined };
	return {
		db: {
			query: {
				applications: { findFirst: mockFindApp },
				compose: none,
				postgres: none,
				mysql: none,
				mariadb: none,
				mongo: none,
				redis: none,
				libsql: { findFirst: mockFindLibsql },
			},
		},
	};
});
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mockExec,
	execAsyncRemote: mockExec,
}));

import { containerBelongsToService } from "@/server/wss/container-ownership";

const labels = (l: Record<string, string>) => ({ stdout: JSON.stringify(l) });

beforeEach(() => {
	vi.clearAllMocks();
	mockFindApp.mockResolvedValue({ appName: "app-mine-abc123" });
	mockFindLibsql.mockResolvedValue(undefined);
});

describe("containerBelongsToService", () => {
	it("allows a container of the service", async () => {
		mockExec.mockResolvedValue(
			labels({ "com.docker.swarm.service.name": "app-mine-abc123" }),
		);
		expect(await containerBelongsToService("svc", "c1")).toBe(true);
	});

	it("denies a container of another service", async () => {
		mockExec.mockResolvedValue(
			labels({ "com.docker.swarm.service.name": "dokploy" }),
		);
		expect(await containerBelongsToService("svc", "c1")).toBe(false);
	});

	it("denies containers without labels or when docker fails", async () => {
		mockExec.mockResolvedValue({ stdout: "null" });
		expect(await containerBelongsToService("svc", "c1")).toBe(false);
		mockExec.mockRejectedValue(new Error("No such object"));
		expect(await containerBelongsToService("svc", "c1")).toBe(false);
	});

	it("resolves libsql services", async () => {
		mockFindApp.mockResolvedValue(undefined);
		mockFindLibsql.mockResolvedValue({ appName: "libsql-abc" });
		mockExec.mockResolvedValue(
			labels({ "com.docker.swarm.service.name": "libsql-abc" }),
		);
		expect(await containerBelongsToService("svc", "c1")).toBe(true);
	});

	it("denies an unknown service", async () => {
		mockFindApp.mockResolvedValue(undefined);
		expect(await containerBelongsToService("nope", "c1")).toBe(false);
	});
});
