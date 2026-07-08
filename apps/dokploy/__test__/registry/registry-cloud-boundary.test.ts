import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleteRegistry: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	returning: vi.fn(),
	transaction: vi.fn(),
	where: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: true,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		delete: mocks.deleteRegistry,
		transaction: mocks.transaction,
		update: vi.fn(),
	},
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const {
	createRegistry,
	removeRegistry,
	sanitizeRegistryError,
	updateRegistry,
} = await import("@dokploy/server/services/registry");

const registryInput = {
	registryName: "private registry",
	registryUrl: "localhost:5000",
	registryType: "cloud" as const,
	username: "user",
	password: "secret",
	imagePrefix: null,
};

describe("cloud registry local login boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.deleteRegistry.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ returning: mocks.returning });
	});

	it("rejects cloud registry create without a remote server before persistence or local docker login", async () => {
		await expect(
			createRegistry({ ...registryInput, serverId: "none" }, "org-1"),
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		expect(mocks.transaction).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("rejects cloud registry update without a remote server before local docker login", async () => {
		await expect(
			updateRegistry("registry-1", {
				...registryInput,
				serverId: "none",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("redacts passwords from removed registry rows", async () => {
		mocks.returning.mockResolvedValue([
			{
				registryId: "registry-1",
				registryName: "registry",
				registryUrl: "registry.example.com",
				registryType: "cloud",
				username: "user",
				password: "stored-registry-password",
				organizationId: "org-1",
			},
		]);

		await expect(removeRegistry("registry-1")).resolves.toMatchObject({
			registryId: "registry-1",
			password: "__DOKPLOY_REDACTED_SECRET__",
		});
	});

	it("redacts shell-escaped registry passwords from login errors", () => {
		const password = "pa'$(id)secret";
		const escapedPassword = "'pa'\\''$(id)secret'";
		const message = `Command failed: printf %s ${escapedPassword} | docker login registry.example`;

		const sanitized = sanitizeRegistryError(new Error(message), password);

		expect(sanitized).not.toContain(password);
		expect(sanitized).not.toContain(escapedPassword);
		expect(sanitized).toContain("***");
	});
});
