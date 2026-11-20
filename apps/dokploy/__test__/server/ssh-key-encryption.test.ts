import { sshKeys } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

const pem =
	"-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n";

describe("sshKeys.privateKey column", () => {
	it("is stored encrypted and read back as the original PEM", () => {
		const stored = sshKeys.privateKey.mapToDriverValue(pem) as string;
		expect(stored.startsWith("enc:v1:")).toBe(true);
		expect(stored).not.toContain("PRIVATE KEY");
		expect(sshKeys.privateKey.mapFromDriverValue(stored)).toBe(pem);
	});

	it("reads legacy plaintext rows unchanged", () => {
		expect(sshKeys.privateKey.mapFromDriverValue(pem)).toBe(pem);
	});

	it("keeps the empty default empty", () => {
		expect(sshKeys.privateKey.mapToDriverValue("")).toBe("");
	});
});
