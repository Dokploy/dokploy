import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildConnectErrorScript,
	buildConnectScript,
	type ConnectTokenPayload,
	createConnectToken,
	decodeConnectToken,
	getConnectClientIp,
	verifyConnectToken,
} from "@dokploy/server/services/server-connect";
import { describe, expect, it } from "vitest";

const NOW = 1_800_000_000_000;
const payload: ConnectTokenPayload = {
	sshKeyId: "Ab3_kX9-qL2mN8pR4sT6v",
	userId: "DTnRRRQ5dmjSQHSLchvagLhmKpTD9VNh",
	expiresAt: NOW / 1000 + 3600,
	serverType: "deploy",
	enableDockerCleanup: true,
};
const privateKey = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END";

describe("connect token", () => {
	it("round-trips", () => {
		const token = createConnectToken(payload, privateKey);
		expect(token).toMatch(/^[A-Za-z0-9_.-]+$/);
		expect(token.length).toBeLessThanOrEqual(100);
		expect(decodeConnectToken(token)).toEqual(payload);
		expect(verifyConnectToken(token, privateKey, NOW)).toBe("valid");
		const build = {
			...payload,
			serverType: "build",
			enableDockerCleanup: false,
		} as const;
		expect(decodeConnectToken(createConnectToken(build, privateKey))).toEqual(
			build,
		);
	});

	it("rejects a token signed with another key", () => {
		const token = createConnectToken(payload, privateKey);
		expect(verifyConnectToken(token, "other-key", NOW)).toBe("invalid");
	});

	it("rejects a tampered payload", () => {
		const token = createConnectToken(payload, privateKey);
		const forged = token.replace(".d1.", ".b1.");
		expect(forged).not.toBe(token);
		expect(verifyConnectToken(forged, privateKey, NOW)).toBe("invalid");
	});

	it("rejects tampered or truncated signatures and garbage", () => {
		const token = createConnectToken(payload, privateKey);
		expect(verifyConnectToken(`${token}x`, privateKey, NOW)).toBe("invalid");
		expect(verifyConnectToken(token.slice(0, -4), privateKey, NOW)).toBe(
			"invalid",
		);
		expect(verifyConnectToken("garbage", privateKey, NOW)).toBe("invalid");
		expect(verifyConnectToken(`${token}.extra`, privateKey, NOW)).toBe(
			"invalid",
		);
		expect(decodeConnectToken("a.b.zz.x9.sig")).toBeNull();
	});

	it("reports expired tokens", () => {
		const token = createConnectToken(
			{ ...payload, expiresAt: NOW / 1000 - 1 },
			privateKey,
		);
		expect(verifyConnectToken(token, privateKey, NOW)).toBe("expired");
	});
});

describe("connect script", () => {
	const publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample dokploy";
	const registerUrl = "https://app.dokploy.com/api/connect/abc.def";

	it("includes the key and register URL inside main", () => {
		const script = buildConnectScript({ publicKey, registerUrl });
		expect(script).toContain(`grep -qxF '${publicKey}'`);
		expect(script).toContain(`'${registerUrl}'`);
		expect(script.trim().endsWith('main "$@"')).toBe(true);
	});

	it("rejects unsafe register URLs and keys", () => {
		expect(() =>
			buildConnectScript({
				publicKey,
				registerUrl: "https://x.com/api/connect/a';rm -rf /;'",
			}),
		).toThrow();
		expect(() =>
			buildConnectScript({ publicKey: "ssh-ed25519 a'b", registerUrl }),
		).toThrow();
	});

	it("falls back to any IP family when IPv4 fails", () => {
		const script = buildConnectScript({ publicKey, registerUrl });
		expect(script).toMatch(/curl -4 [^\n]*\|\|\n\s*code=\$\(curl -sS/);
	});

	it("is valid bash", () => {
		const dir = mkdtempSync(join(tmpdir(), "connect-"));
		const file = join(dir, "s.sh");
		writeFileSync(file, buildConnectScript({ publicKey, registerUrl }));
		execFileSync("bash", ["-n", file]);
		writeFileSync(file, buildConnectErrorScript("It's not valid"));
		execFileSync("bash", ["-n", file]);
	});

	it("appends the key on a new line when authorized_keys lacks a trailing newline", () => {
		const dir = mkdtempSync(join(tmpdir(), "connect-"));
		const keys = join(dir, "authorized_keys");
		writeFileSync(keys, "ssh-rsa EXISTING user@host");
		const snippet = buildConnectScript({ publicKey, registerUrl })
			.split("\n")
			.filter((line) => line.includes('"$keys"') && !line.includes("chmod"))
			.join("\n");
		execFileSync("bash", ["-c", `keys='${keys}'\n${snippet}\n${snippet}`]);
		expect(readFileSync(keys, "utf8")).toBe(
			`ssh-rsa EXISTING user@host\n${publicKey}\n`,
		);
	});
});

describe("getConnectClientIp", () => {
	it("prefers cf-connecting-ip over x-forwarded-for", () => {
		expect(
			getConnectClientIp(
				{
					"cf-connecting-ip": "203.0.113.9",
					"x-forwarded-for": "104.16.0.1",
				},
				"172.18.0.3",
			),
		).toBe("203.0.113.9");
	});

	it("prefers the first x-forwarded-for entry", () => {
		expect(
			getConnectClientIp(
				{ "x-forwarded-for": "203.0.113.5, 10.0.0.2" },
				"10.0.0.2",
			),
		).toBe("203.0.113.5");
	});

	it("falls back to the socket address and strips IPv4-mapped prefixes", () => {
		expect(getConnectClientIp({}, "::ffff:198.51.100.7")).toBe("198.51.100.7");
		expect(getConnectClientIp({}, "2001:db8::1")).toBe("2001:db8::1");
	});

	it("returns null for anything that is not an IP", () => {
		expect(getConnectClientIp({ "x-forwarded-for": "evil.com" }, "")).toBe(
			null,
		);
		expect(getConnectClientIp({}, undefined)).toBe(null);
	});
});
