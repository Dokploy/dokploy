import {
	buildCosignArgs,
	buildCosignDockerArgv,
	DEFAULT_COSIGN_IMAGE,
} from "@dokploy/server/utils/admission/verify-signature";
import { describe, expect, it } from "vitest";

const REF = `ghcr.io/org/app@sha256:${"a".repeat(64)}`;
const MIRROR = `mirror.example.com/cosign@sha256:${"b".repeat(64)}`;

describe("buildCosignArgs", () => {
	it("keyed mode uses --key env://COSIGN_KEY and ends with the ref", () => {
		const args = buildCosignArgs(REF, {
			mode: "keyed",
			publicKey: "-----BEGIN PUBLIC KEY-----\n…",
		});
		expect(args).toEqual(["verify", "--key", "env://COSIGN_KEY", REF]);
	});

	it("keyless mode uses identity + issuer flags", () => {
		const args = buildCosignArgs(REF, {
			mode: "keyless",
			certificateIdentityRegexp: "^https://github.com/org/.+$",
			certificateOidcIssuer: "https://token.actions.githubusercontent.com",
		});
		expect(args).toEqual([
			"verify",
			"--certificate-identity-regexp",
			"^https://github.com/org/.+$",
			"--certificate-oidc-issuer",
			"https://token.actions.githubusercontent.com",
			REF,
		]);
	});

	it("appends --insecure-ignore-tlog when ignoreTlog is set", () => {
		const args = buildCosignArgs(REF, {
			mode: "keyed",
			publicKey: "k",
			ignoreTlog: true,
		});
		expect(args).toContain("--insecure-ignore-tlog");
		expect(args[args.length - 1]).toBe(REF);
	});

	it("throws when keyed mode has no public key", () => {
		expect(() => buildCosignArgs(REF, { mode: "keyed" })).toThrow();
	});

	it("throws when keyless mode is missing identity or issuer", () => {
		expect(() =>
			buildCosignArgs(REF, { mode: "keyless", certificateOidcIssuer: "x" }),
		).toThrow();
	});

	it("rejects a non-digest pinned ref (argv flag-smuggling guard)", () => {
		expect(() =>
			buildCosignArgs("nginx:latest", { mode: "keyed", publicKey: "k" }),
		).toThrow();
	});
});

describe("buildCosignDockerArgv", () => {
	it("mounts the docker config read-only, passes the key via env, never uses a shell", () => {
		const argv = buildCosignDockerArgv(
			REF,
			{ mode: "keyed", publicKey: "PEMDATA" },
			{ dockerConfigDir: "/etc/dokploy/cosign-auth/x" },
		);
		expect(argv[0]).toBe("run");
		expect(argv).toContain("--rm");
		expect(argv).toContain("-v");
		expect(argv).toContain("/etc/dokploy/cosign-auth/x:/root/.docker:ro");
		expect(argv).toContain("-e");
		expect(argv).toContain("COSIGN_KEY=PEMDATA");
		expect(argv).toContain(DEFAULT_COSIGN_IMAGE);
		// the cosign sub-args follow the image, ending with the ref
		expect(argv[argv.length - 1]).toBe(REF);
		// no shell wrapper
		expect(argv).not.toContain("sh");
		expect(argv).not.toContain("-c");
	});

	it("uses a custom cosignImage override when provided", () => {
		const argv = buildCosignDockerArgv(
			REF,
			{
				mode: "keyless",
				certificateIdentityRegexp: "a",
				certificateOidcIssuer: "b",
			},
			{
				dockerConfigDir: "/d",
				cosignImage: MIRROR,
			},
		);
		expect(argv).toContain(MIRROR);
		expect(argv).not.toContain("-e"); // keyless: no COSIGN_KEY env
	});

	it("rejects a flag-like cosignImage override", () => {
		expect(() =>
			buildCosignDockerArgv(
				REF,
				{
					mode: "keyless",
					certificateIdentityRegexp: "a",
					certificateOidcIssuer: "b",
				},
				{ dockerConfigDir: "/d", cosignImage: "-v/etc/passwd:/x" },
			),
		).toThrow();
	});

	it("rejects a dockerConfigDir containing a colon", () => {
		expect(() =>
			buildCosignDockerArgv(
				REF,
				{ mode: "keyed", publicKey: "k" },
				{ dockerConfigDir: "/etc/dokploy:evil" },
			),
		).toThrow();
	});
});
