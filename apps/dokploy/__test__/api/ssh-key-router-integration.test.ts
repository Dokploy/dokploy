import { TRPCError } from "@trpc/server";
import * as ssh2 from "ssh2";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn().mockResolvedValue(undefined),
}));

const auditMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/server/api/utils/audit", () => ({
	audit: auditMock,
}));

const createSshKeyMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@dokploy/server/services/ssh-key", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return { ...actual, createSshKey: createSshKeyMock };
});

const { sshRouter } = await import("@/server/api/routers/ssh-key");

const plainPair = ssh2.utils.generateKeyPairSync("ed25519", {
	comment: "test",
});
const encPair = ssh2.utils.generateKeyPairSync("ed25519", {
	passphrase: "testpass",
	cipher: "aes256-ctr",
	rounds: 16,
	comment: "test",
});

const malformedBody = `${"A".repeat(64)}=`;
const malformedPrivKey = [
	"-----BEGIN OPENSSH PRIVATE KEY-----",
	malformedBody,
	"-----END OPENSSH PRIVATE KEY-----",
	"",
].join("\n");

const buildInput = (privateKey: string) => ({
	name: "my-key",
	description: "a test key",
	publicKey: plainPair.public,
	privateKey,
	organizationId: "input-org-id",
});

const ctx = {
	session: {
		activeOrganizationId: "ctx-org-id",
		user: { id: "u1" },
	},
	user: {
		id: "u1",
		email: "a@b.c",
		role: "owner",
		ownerId: "o1",
		enableEnterpriseFeatures: false,
		isValidEnterpriseLicense: false,
	},
	db: {},
	req: {},
	res: {},
} as const;

const caller = sshRouter.createCaller(ctx as never);

const reset = () => {
	createSshKeyMock.mockClear();
	auditMock.mockClear();
};

describe("ssh.create tRPC router integration (parseability gatekeeper)", () => {
	beforeEach(reset);

	it("rejects an encrypted OpenSSH ed25519 key with the passphrase-specific BAD_REQUEST message (and never persists / audits)", async () => {
		let thrown: unknown;
		try {
			await caller.create(buildInput(encPair.private));
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(TRPCError);
		expect((thrown as TRPCError).code).toBe("BAD_REQUEST");
		expect((thrown as TRPCError).message).toContain(
			"Passphrase-protected SSH keys are not supported",
		);
		expect((thrown as TRPCError).message).toContain("ssh-keygen -p");
		expect((thrown as TRPCError).message).not.toBe(
			"Error creating the SSH key",
		);
		expect(createSshKeyMock).not.toHaveBeenCalled();
		expect(auditMock).not.toHaveBeenCalled();
	});

	it("accepts a valid unencrypted OpenSSH ed25519 key, persists via createSshKey with the session organizationId, and audits once", async () => {
		await caller.create(buildInput(plainPair.private));

		expect(createSshKeyMock).toHaveBeenCalledTimes(1);
		expect(createSshKeyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "my-key",
				publicKey: plainPair.public,
				privateKey: plainPair.private,
				organizationId: "ctx-org-id",
			}),
		);
		expect(auditMock).toHaveBeenCalledTimes(1);
		expect(auditMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "create",
				resourceType: "sshKey",
				resourceName: "my-key",
			}),
		);
	});

	it("rejects a regex-passing but unparseable key with a generic 'Invalid private key:' message (and never persists / audits)", async () => {
		let thrown: unknown;
		try {
			await caller.create(buildInput(malformedPrivKey));
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(TRPCError);
		expect((thrown as TRPCError).code).toBe("BAD_REQUEST");
		expect((thrown as TRPCError).message).toContain("Invalid private key:");
		expect((thrown as TRPCError).message).not.toBe(
			"Error creating the SSH key",
		);
		expect(createSshKeyMock).not.toHaveBeenCalled();
		expect(auditMock).not.toHaveBeenCalled();
	});

	it("rejects a non-PEM string at the Zod input layer before the handler runs", async () => {
		await expect(caller.create(buildInput("just some text"))).rejects.toThrow();
		expect(createSshKeyMock).not.toHaveBeenCalled();
	});
});
