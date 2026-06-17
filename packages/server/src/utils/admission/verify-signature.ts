import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { execAsyncRemote } from "@dokploy/server";
import { quote } from "shell-quote";

const execFileAsync = promisify(execFile);

// Distroless cosign release image, entrypoint `cosign`, reads ~/.docker/config.json.
// Pinned by digest because it is part of the verification TCB.
export const DEFAULT_COSIGN_IMAGE =
	"ghcr.io/sigstore/cosign/cosign:v2.4.1@sha256:REPLACE_WITH_PINNED_DIGEST";

export type TrustPolicyVerification = {
	mode: "keyed" | "keyless";
	publicKey?: string | null;
	certificateIdentityRegexp?: string | null;
	certificateOidcIssuer?: string | null;
	ignoreTlog?: boolean | null;
};

export function buildCosignArgs(
	pinnedRef: string,
	policy: TrustPolicyVerification,
): string[] {
	const args = ["verify"];
	if (policy.mode === "keyed") {
		if (!policy.publicKey) {
			throw new Error("Trust policy (keyed) is missing a public key.");
		}
		args.push("--key", "env://COSIGN_KEY");
	} else {
		if (!policy.certificateIdentityRegexp || !policy.certificateOidcIssuer) {
			throw new Error(
				"Trust policy (keyless) requires certificateIdentityRegexp and certificateOidcIssuer.",
			);
		}
		args.push(
			"--certificate-identity-regexp",
			policy.certificateIdentityRegexp,
			"--certificate-oidc-issuer",
			policy.certificateOidcIssuer,
		);
	}
	if (policy.ignoreTlog) {
		args.push("--insecure-ignore-tlog");
	}
	args.push(pinnedRef);
	return args;
}

export function buildCosignDockerArgv(
	pinnedRef: string,
	policy: TrustPolicyVerification,
	opts: { dockerConfigDir: string; cosignImage?: string | null },
): string[] {
	const image = opts.cosignImage || DEFAULT_COSIGN_IMAGE;
	const argv = [
		"run",
		"--rm",
		"-v",
		`${opts.dockerConfigDir}:/root/.docker:ro`,
	];
	if (policy.mode === "keyed") {
		if (!policy.publicKey) {
			throw new Error("Trust policy (keyed) is missing a public key.");
		}
		argv.push("-e", `COSIGN_KEY=${policy.publicKey}`);
	}
	argv.push(image, ...buildCosignArgs(pinnedRef, policy));
	return argv;
}

export async function verifySignature(
	pinnedRef: string,
	policy: TrustPolicyVerification,
	opts: {
		serverId?: string | null;
		dockerConfigDir: string;
		cosignImage?: string | null;
		onLog?: (line: string) => void;
	},
): Promise<void> {
	const argv = buildCosignDockerArgv(pinnedRef, policy, opts);
	opts.onLog?.(`cosign verify ${pinnedRef}`);
	if (opts.serverId) {
		// Remote: assemble a safely-quoted command string (argv has no user shell metachars
		// beyond the PEM/identity which we single-quote).
		const cmd = quote(["docker", ...argv]);
		await execAsyncRemote(opts.serverId, cmd);
		return;
	}
	// Local: execFile avoids a shell entirely (the cosign image is distroless).
	await execFileAsync("docker", argv);
}
