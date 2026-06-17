import { execAsync, execAsyncRemote } from "@dokploy/server";
import { quote } from "shell-quote";
import { buildPinnedRef, normalizeRepo, parseImageRef } from "./image-ref";

// Pick the RepoDigests entry whose repository matches the deployed ref, and
// return the operator's own repo pinned to that digest. Fail closed otherwise.
export function selectRepoDigest(
	repoDigests: string[],
	originalRef: string,
): string {
	if (!Array.isArray(repoDigests) || repoDigests.length === 0) {
		throw new Error(
			`Cannot resolve a registry digest for "${originalRef}": image has no RepoDigests (unpushed or local-only).`,
		);
	}
	const wantRepo = normalizeRepo(parseImageRef(originalRef).name);
	// A deployed ref is registry-resolvable if it carries a registry/namespace
	// path, or it is a tagged bare name that normalizes to a Docker Hub library
	// image (e.g. "nginx:1.27"). A bare single-segment name with no tag and no
	// path (e.g. "local-built-test") cannot be verified as pullable: fail closed.
	const isResolvable =
		originalRef.includes("/") ||
		(originalRef.includes(":") && wantRepo.startsWith("docker.io/library/"));
	if (!isResolvable) {
		throw new Error(
			`Refusing to pin "${originalRef}": not a registry-resolvable reference.`,
		);
	}
	for (const entry of repoDigests) {
		const atIndex = entry.lastIndexOf("@");
		if (atIndex === -1) continue;
		const entryRepo = entry.slice(0, atIndex);
		const digest = entry.slice(atIndex + 1);
		if (normalizeRepo(entryRepo) === wantRepo) {
			return buildPinnedRef(originalRef, digest);
		}
	}
	throw new Error(
		`No RepoDigest of "${originalRef}" matches its repository ${wantRepo}; refusing to pin to an unrelated registry.`,
	);
}

// Pull the ref to the target host so the verified content is present regardless
// of pull_policy, then read RepoDigests via a separate (Node-readable) exec.
export async function resolveDigest(
	ref: string,
	opts: {
		serverId?: string | null;
		dockerConfigDir: string;
		onLog?: (line: string) => void;
	},
): Promise<string> {
	const pull = `DOCKER_CONFIG=${quote([opts.dockerConfigDir])} docker pull ${quote([ref])}`;
	const inspect = `DOCKER_CONFIG=${quote([opts.dockerConfigDir])} docker inspect --format '{{json .RepoDigests}}' ${quote([ref])}`;

	if (opts.serverId) {
		await execAsyncRemote(opts.serverId, pull);
		const { stdout } = await execAsyncRemote(opts.serverId, inspect);
		return finish(stdout, ref, opts.onLog);
	}
	await execAsync(pull);
	const { stdout } = await execAsync(inspect);
	return finish(stdout, ref, opts.onLog);
}

function finish(
	stdout: string,
	ref: string,
	onLog?: (line: string) => void,
): string {
	const repoDigests = JSON.parse(stdout.trim() || "[]") as string[];
	const pinned = selectRepoDigest(repoDigests, ref);
	onLog?.(`resolved ${ref} -> ${pinned}`);
	return pinned;
}
