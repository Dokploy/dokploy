import { redactServerSshKey } from "@dokploy/server/services/server";
import { describe, expect, it } from "vitest";

describe("redactServerSshKey (server SSH private key disclosure guard)", () => {
	it("blanks the private key while keeping the rest of the ssh key intact", () => {
		const server = {
			serverId: "srv-1",
			name: "prod",
			sshKey: {
				sshKeyId: "key-1",
				publicKey: "ssh-ed25519 AAAA...",
				privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n",
			},
		};

		const redacted = redactServerSshKey(server);

		expect(redacted.sshKey.privateKey).toBe("");
		// Non-secret fields and the surrounding record must survive untouched.
		expect(redacted.sshKey.publicKey).toBe("ssh-ed25519 AAAA...");
		expect(redacted.serverId).toBe("srv-1");
		expect(redacted.name).toBe("prod");
	});

	it("does not mutate the original record", () => {
		const server = {
			serverId: "srv-1",
			sshKey: { privateKey: "top-secret" },
		};
		redactServerSshKey(server);
		expect(server.sshKey.privateKey).toBe("top-secret");
	});

	it("is a no-op when the server has no ssh key", () => {
		const server = { serverId: "srv-2", sshKey: null };
		expect(redactServerSshKey(server)).toEqual(server);
	});

	it("handles a record without a loaded sshKey relation", () => {
		// e.g. server.update returns the plain row where sshKey is not populated.
		const server: { serverId: string; sshKey?: null } = { serverId: "srv-3" };
		expect(redactServerSshKey(server)).toEqual(server);
	});
});
