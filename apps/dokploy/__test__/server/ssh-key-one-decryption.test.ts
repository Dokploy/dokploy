import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findSSHKeyById: vi.fn() }));

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	createSshKey: vi.fn(),
	findSSHKeyById: mocks.findSSHKeyById,
	generateSSHKey: vi.fn(),
	removeSSHKeyById: vi.fn(),
	updateSSHKeyById: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => ({ db: {} }));
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
}));
vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { sshRouter } = await import("@/server/api/routers/ssh-key");

const callerAs = (role: string) =>
	sshRouter.createCaller({
		user: { id: "user-1", role },
		session: { activeOrganizationId: "org-a" },
	} as never);

const keyWith = (privateKey: string) => ({
	sshKeyId: "key-1",
	name: "key",
	organizationId: "org-a",
	publicKey: "ssh-ed25519 AAAA",
	privateKey,
});

describe("sshKey.one", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns the decrypted private key to owners", async () => {
		const pem = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n";
		mocks.findSSHKeyById.mockResolvedValue(keyWith(pem));
		const key = await callerAs("owner").one({ sshKeyId: "key-1" });
		expect(key.privateKey).toBe(pem);
	});

	it("never hands out ciphertext as the private key when decryption failed", async () => {
		mocks.findSSHKeyById.mockResolvedValue(keyWith("enc:v1:AAAA"));
		const key = await callerAs("admin").one({ sshKeyId: "key-1" });
		expect(key.privateKey).toBe("");
		expect(key.name).toBe("key");
	});

	it("blanks the key for members", async () => {
		mocks.findSSHKeyById.mockResolvedValue(keyWith("enc:v1:AAAA"));
		const key = await callerAs("member").one({ sshKeyId: "key-1" });
		expect(key.privateKey).toBe("");
	});
});
