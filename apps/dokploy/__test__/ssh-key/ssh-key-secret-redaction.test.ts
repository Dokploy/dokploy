import { REDACTED_SECRET_VALUE } from "@dokploy/server/utils/security/redaction";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkPermission: vi.fn(),
	createSshKey: vi.fn(),
	findSSHKeyById: vi.fn(),
	generateSSHKey: vi.fn(),
	removeSSHKeyById: vi.fn(),
	sshKeyFindMany: vi.fn(),
	updateSSHKeyById: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	createSshKey: mocks.createSshKey,
	findSSHKeyById: mocks.findSSHKeyById,
	generateSSHKey: mocks.generateSSHKey,
	removeSSHKeyById: mocks.removeSSHKeyById,
	updateSSHKeyById: mocks.updateSSHKeyById,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			sshKeys: {
				findMany: mocks.sshKeyFindMany,
			},
		},
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

const { sshRouter } = await import("../../server/api/routers/ssh-key");

const sshKeyRecord = {
	sshKeyId: "ssh-key-1",
	privateKey: "private-key",
	publicKey: "ssh-ed25519 public",
	name: "deploy",
	description: "deploy key",
	createdAt: "2026-06-24T00:00:00.000Z",
	lastUsedAt: null,
	organizationId: "org-1",
};

const createCaller = () =>
	sshRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			role: "member",
		},
	} as never);

describe("ssh key router secret redaction", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.findSSHKeyById.mockResolvedValue(sshKeyRecord);
		mocks.removeSSHKeyById.mockResolvedValue(sshKeyRecord);
		mocks.sshKeyFindMany.mockResolvedValue([sshKeyRecord]);
		mocks.updateSSHKeyById.mockResolvedValue({
			...sshKeyRecord,
			name: "updated",
		});
	});

	it("redacts private keys from one and all", async () => {
		await expect(
			createCaller().one({ sshKeyId: "ssh-key-1" }),
		).resolves.toMatchObject({
			privateKey: REDACTED_SECRET_VALUE,
			publicKey: "ssh-ed25519 public",
		});

		const [result] = await createCaller().all();
		expect(result?.privateKey).toBe(REDACTED_SECRET_VALUE);
		expect(result?.name).toBe("deploy");
	});

	it("redacts private keys from update responses", async () => {
		const result = await createCaller().update({
			sshKeyId: "ssh-key-1",
			name: "updated",
		});

		expect(result?.privateKey).toBe(REDACTED_SECRET_VALUE);
		expect(mocks.updateSSHKeyById).toHaveBeenCalledWith({
			sshKeyId: "ssh-key-1",
			name: "updated",
		});
	});

	it("redacts private keys from delete responses", async () => {
		const result = await createCaller().remove({ sshKeyId: "ssh-key-1" });

		expect(result?.privateKey).toBe(REDACTED_SECRET_VALUE);
		expect(result?.name).toBe("deploy");
		expect(mocks.removeSSHKeyById).toHaveBeenCalledWith("ssh-key-1");
	});
});
