import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the libsql `remove` mutation. The mutation must,
// like the postgres/mysql/mariadb/mongo peers, fetch the libsql's scheduled
// backups and cancel them before deleting the database row — otherwise the
// backup scheduler is left with orphan jobs (cloud: repeatable bullmq jobs in
// Redis; non-cloud: in-process node-schedule jobs that crash the server on the
// next tick).
//
// The router is exercised directly via a lightweight tRPC stub so the
// mutation logic runs verbatim without loading the real tRPC server (which
// pulls the auth/db graph). Dependencies the mutation touches are mocked.

const stub = vi.hoisted(() => ({
	checkServiceAccess: vi.fn(async () => {}),
	audit: vi.fn(async () => {}),
	findLibsqlById: vi.fn(),
	findBackupsByDbId: vi.fn(async (): Promise<any[]> => []),
	removeService: vi.fn(async () => {}),
	removeLibsqlById: vi.fn(async () => ({})),
	cancelJobs: vi.fn(async () => {}),
}));

// The vi.mock factory below is hoisted above imports, so the procedure stub
// it references must also be hoisted. The inner `p` is closed over so the
// builder can chain (input -> mutation/query/subscription).
const tRpcProcedure: any = vi.hoisted(() => {
	const p: any = {
		input: () => p,
		meta: () => p,
		query: (h: unknown) => ({ __handler: h }),
		mutation: (h: unknown) => ({ __handler: h }),
		subscription: (h: unknown) => ({ __handler: h }),
	};
	return p;
});

vi.mock("@/server/api/trpc", () => ({
	createTRPCRouter: (routes: unknown) => routes,
	protectedProcedure: tRpcProcedure,
	publicProcedure: tRpcProcedure,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: stub.audit }));
vi.mock("@/server/utils/backup", () => ({ cancelJobs: stub.cancelJobs }));
vi.mock("@/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server", () => ({
	checkPortInUse: vi.fn(),
	createLibsql: vi.fn(),
	createMount: vi.fn(),
	deployLibsql: vi.fn(),
	findBackupsByDbId: stub.findBackupsByDbId,
	findEnvironmentById: vi.fn(),
	findLibsqlById: stub.findLibsqlById,
	findProjectById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getContainerLogs: vi.fn(),
	getWebServerSettings: vi.fn(),
	IS_CLOUD: false,
	rebuildDatabase: vi.fn(),
	removeLibsqlById: stub.removeLibsqlById,
	removeService: stub.removeService,
	startService: vi.fn(),
	startServiceRemote: vi.fn(),
	stopService: vi.fn(),
	stopServiceRemote: vi.fn(),
	updateLibsqlById: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	addNewService: vi.fn(),
	checkServiceAccess: stub.checkServiceAccess,
	checkServicePermissionAndAccess: vi.fn(),
}));

import { libsqlRouter } from "@/server/api/routers/libsql";

type RemoveHandler = (opts: {
	input: { libsqlId: string };
	ctx: unknown;
}) => Promise<unknown>;
const removeHandler = (
	libsqlRouter as unknown as { remove: { __handler: RemoveHandler } }
).remove.__handler;

const ORG = "org-1";
const ctx = { session: { activeOrganizationId: ORG }, user: { id: "u-1" } };
const libsqlDb = {
	libsqlId: "lib-1",
	appName: "libsql-app-1",
	serverId: null as string | null,
	environment: { project: { organizationId: ORG } },
};

beforeEach(() => {
	vi.clearAllMocks();
	stub.checkServiceAccess.mockResolvedValue(undefined);
	stub.audit.mockResolvedValue(undefined);
	stub.removeService.mockResolvedValue(undefined);
	stub.removeLibsqlById.mockResolvedValue({});
	stub.cancelJobs.mockResolvedValue(undefined);
	stub.findLibsqlById.mockResolvedValue(libsqlDb);
});

describe("libsql remove mutation — scheduled backup cleanup", () => {
	it("fetches the libsql's backups with type 'libsql' and cancels them", async () => {
		const backups = [
			{
				backupId: "b-1",
				enabled: true,
				schedule: "* * * * *",
				libsql: libsqlDb,
			},
			{
				backupId: "b-2",
				enabled: false,
				schedule: "0 * * * *",
				libsql: libsqlDb,
			},
		];
		stub.findBackupsByDbId.mockResolvedValue(backups);

		await removeHandler({ input: { libsqlId: "lib-1" }, ctx });

		expect(stub.findBackupsByDbId).toHaveBeenCalledWith("lib-1", "libsql");
		expect(stub.cancelJobs).toHaveBeenCalledTimes(1);
		// Must be the exact backups list returned by findBackupsByDbId
		expect(stub.cancelJobs).toHaveBeenCalledWith(backups);
		expect(stub.removeService).toHaveBeenCalledWith("libsql-app-1", null);
		expect(stub.removeLibsqlById).toHaveBeenCalledWith("lib-1");
	});

	it("fetches backups BEFORE deleting the libsql row (cascade-safe ordering)", async () => {
		// backups.libsqlId is ON DELETE CASCADE, so findBackupsByDbId MUST run
		// before removeLibsqlById — otherwise the cascade wipes the rows and
		// cancelJobs would receive an empty list (the original bug).
		stub.findBackupsByDbId.mockResolvedValue([
			{ backupId: "b-1", enabled: true, schedule: "* * * * *" },
		]);

		await removeHandler({ input: { libsqlId: "lib-1" }, ctx });

		expect(stub.findBackupsByDbId).toHaveBeenCalledTimes(1);
		expect(stub.removeLibsqlById).toHaveBeenCalledTimes(1);
		const findOrder = stub.findBackupsByDbId.mock.invocationCallOrder[0];
		const deleteOrder = stub.removeLibsqlById.mock.invocationCallOrder[0];
		expect(findOrder).toBeDefined();
		expect(deleteOrder).toBeDefined();
		expect(findOrder!).toBeLessThan(deleteOrder!);
	});

	it("mirrors the peer routers: cancelJobs runs between removeService and removeLibsqlById", async () => {
		stub.findBackupsByDbId.mockResolvedValue([
			{ backupId: "b-1", enabled: true, schedule: "* * * * *" },
		]);

		await removeHandler({ input: { libsqlId: "lib-1" }, ctx });

		const serviceOrder = stub.removeService.mock.invocationCallOrder[0];
		const cancelOrder = stub.cancelJobs.mock.invocationCallOrder[0];
		const deleteOrder = stub.removeLibsqlById.mock.invocationCallOrder[0];
		expect(serviceOrder).toBeDefined();
		expect(cancelOrder).toBeDefined();
		expect(deleteOrder).toBeDefined();
		expect(serviceOrder!).toBeLessThan(cancelOrder!);
		expect(cancelOrder!).toBeLessThan(deleteOrder!);
	});

	it("returns the libsql record and still deletes the row when there are no backups", async () => {
		stub.findBackupsByDbId.mockResolvedValue([]);

		const result = await removeHandler({ input: { libsqlId: "lib-1" }, ctx });

		expect(stub.findBackupsByDbId).toHaveBeenCalledWith("lib-1", "libsql");
		// cancelJobs is still invoked (with an empty list) so the cleanup step
		// is always present — the divergence that caused this bug would be
		// detected as a missing call.
		expect(stub.cancelJobs).toHaveBeenCalledWith([]);
		expect(stub.removeLibsqlById).toHaveBeenCalledWith("lib-1");
		expect(result).toBe(libsqlDb);
	});

	it("still deletes the libsql row when cancelling jobs throws (cleanup is best-effort)", async () => {
		stub.findBackupsByDbId.mockResolvedValue([
			{ backupId: "b-1", enabled: true, schedule: "* * * * *" },
		]);
		stub.cancelJobs.mockRejectedValue(new Error("schedules API down"));

		await removeHandler({ input: { libsqlId: "lib-1" }, ctx });

		expect(stub.cancelJobs).toHaveBeenCalled();
		// The per-operation try/catch swallows the cancelJobs failure so the
		// database row is still removed.
		expect(stub.removeLibsqlById).toHaveBeenCalledWith("lib-1");
	});

	it("does not cancel jobs for a libsql owned by another organization", async () => {
		stub.findLibsqlById.mockResolvedValue({
			...libsqlDb,
			environment: { project: { organizationId: "other-org" } },
		});

		await expect(
			removeHandler({ input: { libsqlId: "lib-1" }, ctx }),
		).rejects.toThrow(/authorized to delete this Libsql/);

		expect(stub.findBackupsByDbId).not.toHaveBeenCalled();
		expect(stub.cancelJobs).not.toHaveBeenCalled();
		expect(stub.removeLibsqlById).not.toHaveBeenCalled();
	});
});
