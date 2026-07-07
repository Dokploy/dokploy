import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { execAsyncRemote } from "@dokploy/server";
import { quote } from "shell-quote";

const execFileAsync = promisify(execFile);

// Distroless cosign release image, entrypoint `cosign`, reads ~/.docker/config.json.
// Pinned by digest because it is part of the verification TCB.
export const DEFAULT_COSIGN_IMAGE =
	"ghcr.io/sigstore/cosign/cosign:v2.4.1@sha256:b03690aa52bfe94054187142fba24dc54137650682810633901767d8a3e15b31";

export type TrustPolicyVerification = {
	mode: "keyed" | "keyless";
	publicKey?: string | null;
	certificateIdentityRegexp?: string | null;
	certificateOidcIssuer?: string | null;
	ignoreTlog?: boolean | null;
};

const DIGEST_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/:]*@sha256:[0-9a-f]{64}$/;

function assertDigestPinnedRef(value: string, label: string): void {
	if (!DIGEST_REF_RE.test(value)) {
		throw new Error(
			`${label} must be a digest-pinned reference (name@sha256:<64-hex>): got "${value}"`,
		);
	}
}

function assertSafeConfigDir(dir: string): void {
	if (!dir.startsWith("/") || /[:\s]/.test(dir)) {
		throw new Error(
			`dockerConfigDir must be an absolute path with no ':' or whitespace: got "${dir}"`,
		);
	}
}

export function buildCosignArgs(
	pinnedRef: string,
	policy: TrustPolicyVerification,
): string[] {
	assertDigestPinnedRef(pinnedRef, "image reference");
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
	assertSafeConfigDir(opts.dockerConfigDir);
	// DEFAULT_COSIGN_IMAGE is a controlled constant, digest-pinned in Task 4.
	if (opts.cosignImage)
		assertDigestPinnedRef(opts.cosignImage, "cosignImage override");
	const image = opts.cosignImage || DEFAULT_COSIGN_IMAGE;
	const argv = [
		"run",
		"--rm",
		"-v",
		`${opts.dockerConfigDir}:/root/.docker:ro`,
	];
	if (policy.mode === "keyed" && policy.publicKey) {
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
	opts.onLog?.(`🔏 cosign verify ${pinnedRef}`);
	if (opts.serverId) {
		// Remote: assemble a safely-quoted command string (argv has no user shell metachars
		// beyond the PEM/identity which we single-quote).
		const cmd = quote(["docker", ...argv]);
		await execAsyncRemote(opts.serverId, cmd, opts.onLog);
		return;
	}
	// Local: execFile avoids a shell entirely (the cosign image is distroless).
	try {
		const { stdout, stderr } = await execFileAsync("docker", argv);
		if (stdout) opts.onLog?.(stdout);
		if (stderr) opts.onLog?.(stderr);
	} catch (err) {
		const e = err as { stdout?: string; stderr?: string };
		if (e.stdout) opts.onLog?.(e.stdout);
		if (e.stderr) opts.onLog?.(e.stderr);
		throw err;
	}
}
