import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRows = vi.hoisted(
	() => new Map<unknown, { appName: string; serverId: string | null }>(),
);
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
	mockRows.set(applications, { appName: "app-mine-abc123", serverId: null });
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
		mockRows.set(libsql, { appName: "libsql-abc", serverId: null });
		mockExec.mockResolvedValue(
			labels({ "com.docker.swarm.service.name": "libsql-abc" }),
		);
		expect(await containerBelongsToService("svc", "c1")).toBe(true);
	});

	it("denies an unknown service", async () => {
		mockRows.clear();
		expect(await containerBelongsToService("nope", "c1")).toBe(false);
	});

	describe("on a server other than the service's", () => {
		// Answers `docker inspect` per host: the service ID as the app's own
		// server sees it, and the swarm service ID label of the container.
		const hosts = (
			ownServiceId: string,
			containerServiceId: string,
			own: string | null = null,
		) =>
			mockExec.mockImplementation(async (...args: string[]) => {
				const [serverId, command] =
					args.length === 2 ? args : [null, args[0] ?? ""];
				if (command.includes("--type service")) {
					return { stdout: serverId === own ? `${ownServiceId}\n` : "" };
				}
				if (command.includes("com.docker.swarm.service.id")) {
					return { stdout: `${containerServiceId}\n` };
				}
				return labels({ "com.docker.swarm.service.name": "app-mine-abc123" });
			});

		it("denies a container that is not a task of the service", async () => {
			hosts("swarm-svc-id", "another-svc-id");
			expect(await containerBelongsToService("svc", "c1", "srv-other")).toBe(
				false,
			);
		});

		it("denies a same-named container outside the swarm", async () => {
			hosts("swarm-svc-id", "");
			expect(await containerBelongsToService("svc", "c1", "srv-other")).toBe(
				false,
			);
		});

		it("allows a task of the same swarm service on another node", async () => {
			hosts("swarm-svc-id", "swarm-svc-id");
			expect(await containerBelongsToService("svc", "c1", "srv-other")).toBe(
				true,
			);
		});

		it("still checks swarm log targets against the service's own server", async () => {
			hosts("swarm-svc-id", "swarm-svc-id");
			expect(
				await containerBelongsToService("svc", "task1", "srv-other", "swarm"),
			).toBe(false);
		});

		it("applies to services deployed on a remote server", async () => {
			mockRows.set(applications, {
				appName: "app-mine-abc123",
				serverId: "srv-1",
			});
			hosts("swarm-svc-id", "another-svc-id", "srv-1");
			expect(await containerBelongsToService("svc", "c1")).toBe(false);
			hosts("swarm-svc-id", "swarm-svc-id", "srv-1");
			expect(await containerBelongsToService("svc", "c1", "srv-2")).toBe(true);
			mockExec.mockResolvedValue(
				labels({ "com.docker.swarm.service.name": "app-mine-abc123" }),
			);
			expect(await containerBelongsToService("svc", "c1", "srv-1")).toBe(true);
		});
	});

	describe("swarm tasks", () => {
		const swarm = (serviceSpec: object) =>
			mockExec
				.mockResolvedValueOnce({ stdout: "swarm-svc-id\n" })
				.mockResolvedValueOnce({ stdout: JSON.stringify(serviceSpec) });

		it("allows a task of the service", async () => {
			swarm({ Name: "app-mine-abc123" });
			expect(
				await containerBelongsToService("svc", "task1", null, "swarm"),
			).toBe(true);
		});

		it("allows a task of a stack the service deployed", async () => {
			swarm({
				Name: "app-mine-abc123_web",
				Labels: { "com.docker.stack.namespace": "app-mine-abc123" },
			});
			expect(
				await containerBelongsToService("svc", "task1", null, "swarm"),
			).toBe(true);
		});

		it("denies a task of another service", async () => {
			swarm({ Name: "dokploy" });
			expect(
				await containerBelongsToService("svc", "task1", null, "swarm"),
			).toBe(false);
		});

		it("denies a target that is not a task", async () => {
			mockExec.mockRejectedValue(new Error("No such task: dokploy"));
			expect(
				await containerBelongsToService("svc", "dokploy", null, "swarm"),
			).toBe(false);
		});
	});
});
