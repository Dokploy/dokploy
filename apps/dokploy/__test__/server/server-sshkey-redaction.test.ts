import {
	redactServerSshKey,
	resolveServerSshHost,
} from "@dokploy/server/services/server";
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

describe("resolveServerSshHost", () => {
	it("uses the public IPv4 by default", () => {
		expect(
			resolveServerSshHost({
				ipAddress: " 203.0.113.10 ",
				internalIpAddress: "10.0.0.10",
				useInternalIp: false,
			}),
		).toBe("203.0.113.10");
	});

	it("uses the internal IPv4 when selected", () => {
		expect(
			resolveServerSshHost({
				ipAddress: "203.0.113.10",
				internalIpAddress: " 10.0.0.10 ",
				useInternalIp: true,
			}),
		).toBe("10.0.0.10");
	});

	it("fails clearly when the selected address is missing", () => {
		expect(() =>
			resolveServerSshHost({
				ipAddress: "203.0.113.10",
				internalIpAddress: "",
				useInternalIp: true,
			}),
		).toThrow("no internal IPv4 address is configured");
	});
});
