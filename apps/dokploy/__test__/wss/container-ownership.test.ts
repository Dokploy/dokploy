import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRows = vi.hoisted(() => new Map<unknown, { appName: string }>());
const mockExec = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/db", () => ({
	db: {
		select: () => ({
			from: (table: unknown) => ({
				where: () => ({
					limit: async () => {
						const row = mockRows.get(table);
						return row ? [row] : [];
					},
				}),
			}),
		}),
	},
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mockExec,
	execAsyncRemote: mockExec,
}));

import { applications, libsql } from "@dokploy/server/db/schema";
import { containerBelongsToService } from "@/server/wss/container-ownership";

const labels = (l: Record<string, string>) => ({ stdout: JSON.stringify(l) });

beforeEach(() => {
	vi.clearAllMocks();
	mockRows.clear();
	mockRows.set(applications, { appName: "app-mine-abc123" });
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
		mockRows.clear();
		mockRows.set(libsql, { appName: "libsql-abc" });
		mockExec.mockResolvedValue(
			labels({ "com.docker.swarm.service.name": "libsql-abc" }),
		);
		expect(await containerBelongsToService("svc", "c1")).toBe(true);
	});

	it("denies an unknown service", async () => {
		mockRows.clear();
		expect(await containerBelongsToService("nope", "c1")).toBe(false);
	});
});
