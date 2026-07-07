import {
	execAsync,
	execAsyncRemote,
	safeDockerLoginCommand,
} from "@dokploy/server";
import { quote } from "shell-quote";
import { resolveDigest } from "./resolve-digest";
import {
	type TrustPolicyVerification,
	verifySignature,
} from "./verify-signature";

export type AdmissionCreds = {
	registryUrl?: string | null;
	username?: string | null;
	password?: string | null;
} | null;

// Host-shared base path bind-mounted identically into the dokploy container and
// the host, so `docker run -v` resolves it on the host daemon (local deploys).
const ADMISSION_AUTH_BASE = "/etc/dokploy/.cosign-auth";

export async function admitImage(
	ref: string,
	opts: {
		trustPolicy?:
			| (TrustPolicyVerification & { cosignImage?: string | null })
			| null;
		creds?: AdmissionCreds;
		serverId?: string | null;
		deployId: string;
		onLog?: (line: string) => void;
	},
): Promise<string> {
	const dir = `${ADMISSION_AUTH_BASE}/${opts.deployId}`;
	const run = (cmd: string) =>
		opts.serverId ? execAsyncRemote(opts.serverId, cmd) : execAsync(cmd);

	await run(`mkdir -p ${quote([dir])} && chmod 700 ${quote([dir])}`);
	try {
		if (opts.creds?.username && opts.creds?.password) {
			const login = safeDockerLoginCommand(
				opts.creds.registryUrl || "",
				opts.creds.username,
				opts.creds.password,
			);
			await run(`export DOCKER_CONFIG=${quote([dir])}; ${login}`);
		}
		const pinned = await resolveDigest(ref, {
			serverId: opts.serverId,
			dockerConfigDir: dir,
			onLog: opts.onLog,
		});
		if (opts.trustPolicy) {
			await verifySignature(pinned, opts.trustPolicy, {
				serverId: opts.serverId,
				dockerConfigDir: dir,
				cosignImage: opts.trustPolicy.cosignImage,
				onLog: opts.onLog,
			});
		}
		return pinned;
	} finally {
		await run(`rm -rf ${quote([dir])}`).catch(() => undefined);
	}
}
