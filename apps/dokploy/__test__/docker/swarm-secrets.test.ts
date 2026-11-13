import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
	info: vi.fn(),
	listSecrets: vi.fn(),
	listServices: vi.fn(),
	createSecret: vi.fn(),
	getSecret: vi.fn(),
	inspect: vi.fn(),
	remove: vi.fn(),
	remote: vi.fn(),
}));
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mock.remote,
}));

import {
	countSwarmSecrets,
	createSwarmSecret,
	getSecretReferences,
	listSwarmSecrets,
	removeSwarmSecret,
} from "@dokploy/server/services/docker-secret";

const id = "a".repeat(25);
const spec = (ids: string[]) => ({
	Name: "demo_mysql",
	Labels: { "com.docker.stack.namespace": "demo" },
	TaskTemplate: {
		ContainerSpec: {
			Env: ["PASSWORD=do-not-return"],
			Secrets: ids.map((SecretID) => ({ SecretID })),
		},
	},
});
const service = (ids: string[], previous: string[] = []) =>
	({
		ID: "service-1",
		Spec: spec(ids),
		PreviousSpec: spec(previous),
	}) as Parameters<typeof getSecretReferences>[1][number];

beforeEach(() => {
	vi.resetAllMocks();
	mock.remote.mockResolvedValue(mock);
	mock.info.mockResolvedValue({
		Swarm: { LocalNodeState: "active", ControlAvailable: true },
	});
	mock.listSecrets.mockResolvedValue([
		{
			ID: id,
			CreatedAt: "2026-11-08T00:00:00Z",
			Spec: {
				Name: "mysql_prod",
				Data: "must-not-return",
				Labels: { private: "must-not-return" },
			},
		},
	]);
	mock.listServices.mockResolvedValue([]);
	mock.createSecret.mockResolvedValue({ id });
	mock.getSecret.mockReturnValue({
		remove: mock.remove,
		inspect: mock.inspect,
	});
	mock.inspect.mockResolvedValue({ Spec: { Name: "mysql_prod" } });
	mock.remove.mockResolvedValue(undefined);
});

describe("Swarm secret service", () => {
	it("returns only the overview count without service references or secret metadata", async () => {
		expect(await countSwarmSecrets("remote-1")).toEqual({ total: 1 });
		expect(mock.remote).toHaveBeenCalledWith("remote-1");
		expect(mock.listServices).not.toHaveBeenCalled();
	});
	it("returns zero for an empty secret store", async () => {
		mock.listSecrets.mockResolvedValue([]);
		expect(await countSwarmSecrets()).toEqual({ total: 0 });
	});
	it("does not report zero when the secret count fails", async () => {
		mock.listSecrets.mockRejectedValue(new Error("offline"));
		await expect(countSwarmSecrets()).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
		});
	});
	it.each(["", "MYSQL_PROD", "mysql_prod ", "other-secret"])(
		"rejects a non-matching confirmation name %j",
		async (confirmationName) => {
			await expect(
				removeSwarmSecret(id, confirmationName),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(mock.remove).not.toHaveBeenCalled();
		},
	);

	it("returns only safe metadata and service references", async () => {
		mock.listServices.mockResolvedValue([service([id], [id])]);
		expect(await listSwarmSecrets()).toEqual([
			{
				id,
				name: "mysql_prod",
				createdAt: "2026-11-08T00:00:00Z",
				services: [
					{
						id: "service-1",
						name: "demo_mysql",
						stack: "demo",
						current: true,
						rollback: true,
					},
				],
			},
		]);
	});
	it("handles an empty Swarm", async () => {
		mock.listSecrets.mockResolvedValue([]);
		expect(await listSwarmSecrets()).toEqual([]);
	});
	it("does not turn a service lookup failure into an unused secret", async () => {
		mock.listServices.mockRejectedValue(new Error("offline"));
		await expect(listSwarmSecrets()).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
		});
	});
	it("does not use a name match instead of the secret ID", () => {
		expect(getSecretReferences("another-id", [service([id])])).toEqual([]);
	});
	it.each([{ previous: [] }, { previous: [id] }])(
		"blocks deletion of current references with previous IDs %j",
		async ({ previous }) => {
			mock.listServices.mockResolvedValue([
				{
					...service([id], previous),
					Spec: { ...spec([id]), Mode: { Replicated: { Replicas: 0 } } },
				},
			]);
			await expect(removeSwarmSecret(id, "mysql_prod")).rejects.toMatchObject({
				code: "CONFLICT",
			});
			expect(mock.remove).not.toHaveBeenCalled();
		},
	);
	it("protects a secret used only by the rollback spec", async () => {
		mock.listServices.mockResolvedValue([service([], [id])]);
		await expect(removeSwarmSecret(id, "mysql_prod")).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(mock.remove).not.toHaveBeenCalled();
	});
	it("deletes by immutable ID only after fetching live references", async () => {
		await removeSwarmSecret(id, "mysql_prod", "remote-1");
		expect(mock.remote).toHaveBeenCalledWith("remote-1");
		expect(mock.getSecret).toHaveBeenCalledWith(id);
		expect(mock.listServices.mock.invocationCallOrder[0]).toBeLessThan(
			mock.remove.mock.invocationCallOrder[0]!,
		);
	});
	it("lets Docker reject a concurrent attachment", async () => {
		mock.remove.mockRejectedValue({
			statusCode: 409,
			message: "attached concurrently",
		});
		await expect(removeSwarmSecret(id, "mysql_prod")).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});
	it("fails closed when deletion reference lookup fails", async () => {
		mock.listServices.mockRejectedValue(new Error("offline"));
		await expect(removeSwarmSecret(id, "mysql_prod")).rejects.toThrow();
		expect(mock.remove).not.toHaveBeenCalled();
	});
	it("preserves multiline Unicode and whitespace without shell commands", async () => {
		const value = "  密码\n$(echo unsafe)\n\0tail\n";
		expect(await createSwarmSecret("mysql_prod", value, "remote-1")).toEqual({
			id,
		});
		expect(mock.createSecret).toHaveBeenCalledWith({
			Name: "mysql_prod",
			Data: Buffer.from(value).toString("base64"),
		});
		expect(mock.remote).toHaveBeenCalledWith("remote-1");
	});
	it.each(["inactive", "pending", "error", "locked"])(
		"rejects Swarm state %s",
		async (state) => {
			mock.info.mockResolvedValue({
				Swarm: { LocalNodeState: state, ControlAvailable: true },
			});
			await expect(listSwarmSecrets()).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
			});
			expect(mock.listSecrets).not.toHaveBeenCalled();
		},
	);
	it("rejects workers without calling the secrets API", async () => {
		mock.info.mockResolvedValue({
			Swarm: { LocalNodeState: "active", ControlAvailable: false },
		});
		await expect(createSwarmSecret("test", "value")).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
		expect(mock.createSecret).not.toHaveBeenCalled();
	});
	it.each([404, 409, 500])(
		"redacts Docker error %i and its cause",
		async (statusCode) => {
			mock.createSecret.mockRejectedValue(
				Object.assign(new Error("PRIVATE_VALUE"), {
					statusCode,
					json: { Data: "PRIVATE_VALUE" },
				}),
			);
			const error = await createSwarmSecret("test", "PRIVATE_VALUE").catch(
				(e) => e,
			);
			expect(error.message).not.toContain("PRIVATE_VALUE");
			expect(error.cause).toBeUndefined();
		},
	);
});
