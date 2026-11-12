import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	isCloud: false,
	sshKey: null as null | Record<string, string>,
	claimed: true,
	released: vi.fn(),
	org: { ownerId: "owner-1" } as null | { ownerId: string },
	owner: { id: "owner-1", serversQuantity: 1 },
	ownerServers: [] as unknown[],
	findMember: vi.fn(),
	checkPermission: vi.fn(),
	createServer: vi.fn(),
	applyDockerCleanupSchedule: vi.fn(),
	audit: vi.fn(),
	captureEvent: vi.fn(),
}));

vi.mock("@dokploy/server", async () => {
	const connect = await import("@dokploy/server/services/server-connect");
	return {
		...connect,
		get IS_CLOUD() {
			return mocks.isCloud;
		},
		captureEvent: mocks.captureEvent,
		createServer: mocks.createServer,
		findUserById: async () => mocks.owner,
		findServersByUserId: async () => mocks.ownerServers,
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		update: () => ({
			set: (values: { lastUsedAt: string | null }) => ({
				where: () => {
					if (values.lastUsedAt === null) {
						mocks.released();
						return Promise.resolve();
					}
					return {
						returning: async () =>
							mocks.claimed ? [{ sshKeyId: "key-1" }] : [],
					};
				},
			}),
		}),
		query: {
			sshKeys: { findFirst: async () => mocks.sshKey },
			organization: { findFirst: async () => mocks.org },
		},
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	findMemberByUserId: mocks.findMember,
	checkPermission: mocks.checkPermission,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

vi.mock("@/server/utils/docker-cleanup", () => ({
	applyDockerCleanupSchedule: mocks.applyDockerCleanupSchedule,
}));

const { createConnectToken } = await import(
	"@dokploy/server/services/server-connect"
);
const { registerConnectedServer } = await import(
	"@/server/utils/connect-server"
);

const PRIVATE_KEY = "private-key";
const makeToken = (overrides = {}) =>
	createConnectToken(
		{
			sshKeyId: "key-1",
			userId: "user-1",
			serverType: "build",
			enableDockerCleanup: false,
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			...overrides,
		},
		PRIVATE_KEY,
	);

describe("registerConnectedServer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.isCloud = false;
		mocks.sshKey = {
			sshKeyId: "key-1",
			organizationId: "org-1",
			privateKey: PRIVATE_KEY,
			name: "Web",
			description: "Runs the web app",
		};
		mocks.claimed = true;
		mocks.org = { ownerId: "owner-1" };
		mocks.ownerServers = [];
		mocks.findMember.mockResolvedValue({
			role: "admin",
			user: { id: "user-1", email: "u@example.com" },
		});
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.createServer.mockImplementation(async (input) => ({
			...input,
			serverId: "srv-1",
		}));
	});

	it("creates the server from the SSH key's name and the token's settings", async () => {
		const result = await registerConnectedServer({
			token: makeToken(),
			ipAddress: "203.0.113.5",
		});

		expect(result).toMatchObject({ status: 200, serverId: "srv-1" });
		expect(mocks.createServer).toHaveBeenCalledWith(
			{
				name: "Web",
				description: "Runs the web app",
				ipAddress: "203.0.113.5",
				port: 22,
				username: "root",
				sshKeyId: "key-1",
				serverType: "build",
				enableDockerCleanup: false,
			},
			"org-1",
		);
		expect(mocks.applyDockerCleanupSchedule).toHaveBeenCalledWith(
			"srv-1",
			"org-1",
			false,
		);
		expect(mocks.audit).toHaveBeenCalledWith(
			{
				user: { id: "user-1", email: "u@example.com", role: "admin" },
				session: { activeOrganizationId: "org-1" },
			},
			expect.objectContaining({ action: "create", resourceType: "server" }),
		);
	});

	it("rejects invalid, unknown-key and expired tokens", async () => {
		expect(
			(await registerConnectedServer({ token: "nope", ipAddress: "1.1.1.1" }))
				.status,
		).toBe(400);

		const known = mocks.sshKey;
		mocks.sshKey = null;
		expect(
			(
				await registerConnectedServer({
					token: makeToken(),
					ipAddress: "1.1.1.1",
				})
			).status,
		).toBe(400);

		mocks.sshKey = known;
		expect(
			(
				await registerConnectedServer({
					token: makeToken({ userId: "user-2" }).replace("user-2", "user-1"),
					ipAddress: "1.1.1.1",
				})
			).status,
		).toBe(400);

		expect(
			(
				await registerConnectedServer({
					token: makeToken({ expiresAt: 1 }),
					ipAddress: "1.1.1.1",
				})
			).status,
		).toBe(410);
		expect(mocks.createServer).not.toHaveBeenCalled();
	});

	it("rejects when the IP cannot be detected", async () => {
		const result = await registerConnectedServer({
			token: makeToken(),
			ipAddress: null,
		});
		expect(result.status).toBe(400);
		expect(mocks.createServer).not.toHaveBeenCalled();
	});

	it("rejects when the user lost access", async () => {
		mocks.checkPermission.mockRejectedValue(new Error("denied"));
		const result = await registerConnectedServer({
			token: makeToken(),
			ipAddress: "1.1.1.1",
		});
		expect(result.status).toBe(403);
		expect(mocks.createServer).not.toHaveBeenCalled();
	});

	it("rejects a command that was already used", async () => {
		mocks.claimed = false;
		const result = await registerConnectedServer({
			token: makeToken(),
			ipAddress: "1.1.1.1",
		});
		expect(result.status).toBe(409);
		expect(mocks.createServer).not.toHaveBeenCalled();
	});

	it("releases the claim when creating the server fails", async () => {
		mocks.createServer.mockRejectedValue(new Error("db down"));
		await expect(
			registerConnectedServer({ token: makeToken(), ipAddress: "1.1.1.1" }),
		).rejects.toThrow("db down");
		expect(mocks.released).toHaveBeenCalled();
	});

	it("enforces the cloud server quota", async () => {
		mocks.isCloud = true;
		mocks.ownerServers = [{}];
		const result = await registerConnectedServer({
			token: makeToken(),
			ipAddress: "1.1.1.1",
		});
		expect(result.status).toBe(403);
		expect(mocks.createServer).not.toHaveBeenCalled();
	});
});
