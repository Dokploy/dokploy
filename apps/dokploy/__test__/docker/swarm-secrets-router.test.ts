import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
	count: vi.fn(),
	permission: vi.fn(),
	serverAccess: vi.fn(),
	server: vi.fn(),
	list: vi.fn(),
	create: vi.fn(),
	remove: vi.fn(),
	audit: vi.fn(),
}));
vi.mock("@dokploy/server", () => ({
	countSwarmSecrets: mock.count,
	assertServerAccess: mock.serverAccess,
	findServerById: mock.server,
	createSwarmSecret: mock.create,
	listSwarmSecrets: mock.list,
	removeSwarmSecret: mock.remove,
	SWARM_SECRET_MAX_BYTES: 500 * 1024 - 1,
	hasValidLicense: vi.fn(),
}));
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mock.permission,
}));
vi.mock("@/server/api/utils/audit", () => ({ audit: mock.audit }));

import { dockerSecretRouter } from "@/server/api/routers/docker-secret";

const secretId = "a".repeat(25);
const remoteInput = {
	serverId: "remote-1",
	name: "test",
	value: "value",
	secretId,
	confirmationName: "test",
};
const methods = ["count", "list", "create", "remove"] as const;
const expectNoSecretOperations = () => {
	for (const method of methods) expect(mock[method]).not.toHaveBeenCalled();
	expect(mock.audit).not.toHaveBeenCalled();
};
const context = () => ({
	user: { id: "user-1", email: "tester@example.test", role: "member" },
	session: { id: "session-1", userId: "user-1", activeOrganizationId: "org-1" },
	req: { headers: { cookie: "session=cookie" } },
	res: {},
});
const caller = (ctx: unknown = context()) =>
	dockerSecretRouter.createCaller(ctx as never);

beforeEach(() => {
	vi.resetAllMocks();
	mock.create.mockResolvedValue({ id: secretId });
	mock.list.mockResolvedValue([]);
	mock.count.mockResolvedValue({ total: 2 });
	mock.server.mockResolvedValue({ organizationId: "org-1" });
});

describe("Swarm secret API boundary", () => {
	it("allows the overview count without exposing names", async () => {
		expect(await caller().count({ serverId: "remote-1" })).toEqual({
			total: 2,
		});
		expect(mock.count).toHaveBeenCalledWith("remote-1");
	});
	it("requires a confirmation name even for direct API deletion", async () => {
		await expect(caller().remove({ secretId } as never)).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(mock.remove).not.toHaveBeenCalled();
	});
	it("passes the confirmation name to the Docker service", async () => {
		await caller().remove({
			secretId,
			confirmationName: "mysql_prod",
			serverId: "remote-1",
		});
		expect(mock.remove).toHaveBeenCalledWith(
			secretId,
			"mysql_prod",
			"remote-1",
		);
	});

	it("redacts database failures at the API boundary", async () => {
		mock.list.mockRejectedValue(new Error("PRIVATE_DATABASE_DIAGNOSTIC"));
		const error = await caller()
			.list({})
			.catch((error) => error);
		expect(error.code).toBe("INTERNAL_SERVER_ERROR");
		expect(error.message).not.toContain("PRIVATE_DATABASE_DIAGNOSTIC");
		expect(error.cause).toBeUndefined();
	});
	it.each(["count", "list", "create", "remove"] as const)(
		"requires Docker permission for %s",
		async (method) => {
			mock.permission.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
			const args = {
				serverId: "remote-1",
				name: "test",
				value: "value",
				secretId,
				confirmationName: "test",
			};
			await expect(caller()[method](args)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(mock.permission).toHaveBeenCalledWith(expect.anything(), {
				docker: ["read"],
			});
			expect(mock.serverAccess).not.toHaveBeenCalled();
		},
	);
	it.each(["count", "list", "create", "remove"] as const)(
		"checks selected-server access for %s",
		async (method) => {
			mock.serverAccess.mockRejectedValue(
				new TRPCError({ code: "UNAUTHORIZED" }),
			);
			await expect(
				caller()[method]({
					serverId: "foreign-server",
					name: "test",
					value: "value",
					secretId,
					confirmationName: "test",
				}),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
			expect(mock.serverAccess).toHaveBeenCalledWith(
				context().session,
				"foreign-server",
			);
		},
	);
	it.each(methods)(
		"rejects a foreign organization even when assigned-server access allows %s",
		async (method) => {
			mock.serverAccess.mockResolvedValue(undefined);
			mock.server.mockResolvedValue({ organizationId: "org-2" });
			await expect(caller()[method](remoteInput)).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			expect(mock.serverAccess).toHaveBeenCalledWith(
				context().session,
				remoteInput.serverId,
			);
			expectNoSecretOperations();
		},
	);
	it.each(methods)(
		"allows an assigned server in the active organization for %s",
		async (method) => {
			await caller()[method](remoteInput);
			expect(mock.server).toHaveBeenCalledWith(remoteInput.serverId);
			expect(mock[method]).toHaveBeenCalled();
		},
	);
	it.each(methods)("rejects a missing remote server for %s", async (method) => {
		mock.server.mockRejectedValue(new TRPCError({ code: "NOT_FOUND" }));
		await expect(caller()[method](remoteInput)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expectNoSecretOperations();
	});
	it.each(methods)(
		"redacts a failed server ownership lookup for %s",
		async (method) => {
			mock.server.mockRejectedValue(new Error("PRIVATE_SERVER_DIAGNOSTIC"));
			const error = await caller()
				[method](remoteInput)
				.catch((error) => error);
			expect(error.code).toBe("INTERNAL_SERVER_ERROR");
			expect(error.message).not.toContain("PRIVATE_SERVER_DIAGNOSTIC");
			expect(error.cause).toBeUndefined();
			expectNoSecretOperations();
		},
	);
	it.each(methods)(
		"checks local-server access without a remote lookup for %s",
		async (method) => {
			await caller()[method]({ ...remoteInput, serverId: undefined });
			expect(mock.serverAccess).toHaveBeenCalledWith(context().session, null);
			expect(mock.server).not.toHaveBeenCalled();
			expect(mock[method]).toHaveBeenCalled();
		},
	);
	it("opens the list directly with normal Docker access", async () => {
		expect(await caller().list({ serverId: "remote-1" })).toEqual([]);
		expect(mock.list).toHaveBeenCalledWith("remote-1");
	});
	it.each(["count", "list", "create", "remove"] as const)(
		"requires sign-in for %s",
		async (method) => {
			for (const ctx of [
				{ ...context(), user: null },
				{ ...context(), session: null },
			]) {
				await expect(
					caller(ctx)[method]({
						serverId: "remote-1",
						name: "test",
						value: "value",
						secretId,
						confirmationName: "test",
					}),
				).rejects.toMatchObject({ code: "UNAUTHORIZED" });
			}
			expect(mock.permission).not.toHaveBeenCalled();
			expect(mock.list).not.toHaveBeenCalled();
			expect(mock.create).not.toHaveBeenCalled();
			expect(mock.remove).not.toHaveBeenCalled();
		},
	);
	it.each(["", "-flag", "has space", "$(command)", "a".repeat(65), "é"])(
		"rejects invalid name %s",
		async (name) => {
			await expect(
				caller().create({ name, value: "value" }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(mock.create).not.toHaveBeenCalled();
		},
	);
	it.each(["x".repeat(500 * 1024 - 1), `${"é".repeat(255999)}x`])(
		"accepts a 64-character name and the maximum UTF-8 byte size %#",
		async (value) => {
			await caller().create({
				name: "a".repeat(64),
				value,
			});
			expect(mock.create).toHaveBeenCalled();
		},
	);
	it.each([
		"",
		"x".repeat(500 * 1024),
		"x".repeat(500 * 1024 + 1),
		"é".repeat(256000),
	])("rejects empty or oversized UTF-8 data %#", async (value) => {
		await expect(
			caller().create({ name: "test", value }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mock.create).not.toHaveBeenCalled();
	});
	it("rejects names instead of IDs for deletion", async () => {
		await expect(
			caller().remove({
				secretId: "secret_name",
				confirmationName: "test",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mock.remove).not.toHaveBeenCalled();
	});
	it("audits successful creation without secret values", async () => {
		await caller().create({
			name: "mysql_prod",
			value: "PRIVATE_VALUE",
		});
		expect(mock.audit).toHaveBeenCalledWith(expect.anything(), {
			action: "create",
			resourceType: "docker",
			resourceId: secretId,
			resourceName: "mysql_prod",
			metadata: { kind: "swarm-secret", serverId: null },
		});
		expect(JSON.stringify(mock.audit.mock.calls)).not.toContain(
			"PRIVATE_VALUE",
		);
	});
	it("does not audit a failed deletion as successful", async () => {
		mock.remove.mockRejectedValue(new TRPCError({ code: "CONFLICT" }));
		await expect(
			caller().remove({ secretId, confirmationName: "test" }),
		).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(mock.audit).not.toHaveBeenCalled();
	});
	it("preserves a worker or inactive Swarm error", async () => {
		mock.list.mockRejectedValue(
			new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "Select a Swarm manager.",
			}),
		);
		await expect(caller().list({})).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: "Select a Swarm manager.",
		});
	});
});
