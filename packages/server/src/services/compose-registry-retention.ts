import { join } from "node:path";
import {
	type ComposePathLike,
	getComposeBackupDir,
	getComposeBuildOverridePath,
	LAST_GOOD_OVERRIDE_BAK,
	PRE_DEPLOY_OVERRIDE_BAK,
} from "@dokploy/server/utils/builders/compose";
import {
	BUILD_REGISTRY_KEEP_DPL_TAGS,
	buildRegistryCurlConfig,
	getManifestChildDigests,
	getManifestUrl,
	getReadFilesCommand,
	getRegistryApiBases,
	getTagsListUrl,
	isValidDigest,
	isValidTag,
	mapDeploymentTagTimes,
	NO_CURL_MARKER,
	REGISTRY_CURL_COMMAND,
	type RegistryRequest,
	type RegistryResponse,
	parseOverrideImages,
	parseRegistryEndpoint,
	parseRegistryImageRef,
	parseRegistryResponses,
	planRepoTags,
	selectDigestsToDelete,
	splitFileOutput,
} from "@dokploy/server/utils/builders/compose-registry-retention";
import {
	execAsync,
	execAsyncRemote,
	openRemoteInputSession,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";
import { createDeploymentLogWriter } from "./compose-build-server";
import { findAllDeploymentsByComposeId } from "./deployment";
import { findRegistryByIdWithCredentials } from "./registry";

/**
 * Retention for the `dpl-<deploymentId>` tags a build-server compose pushes.
 *
 * Every deploy pushes one tag per service repository and nothing removes them,
 * so the registry grows with every release. After a *successful* deploy this
 * keeps the newest `BUILD_REGISTRY_KEEP_DPL_TAGS` tags per service repository
 * and deletes the manifests of the rest.
 *
 * Which host talks to the registry: the compose's **build server**. It already
 * pushed to that registry, so it can reach it by definition. That matters for
 * the setups this exists for, where the registry is `localhost:5000` through an
 * SSH tunnel that only exists on the build server; the Dokploy host could not
 * resolve that address at all. The serving host can usually reach it as well
 * (it pulls), but it is the host users care most about, so it is left alone.
 * The build server is always a remote server, so every call goes over SSH.
 *
 * Credentials: curl runs with `--config -` and the registry password travels
 * on that command's stdin (`openRemoteInputSession`). The command string, and
 * therefore the remote shell's argv, the environment, any file and any log,
 * never contain it.
 *
 * Everything here is best effort and bounded. `pruneComposeBuildRegistry`
 * never throws; every failure (a 401, a 405 because deletes are disabled, a
 * registry without the v2 delete API, a network error, a missing curl, a
 * timeout) becomes one warning line in the deployment log.
 */

/** Wall-clock budget for one retention run. */
const RETENTION_BUDGET_MS = 45_000;
/** Longest a single curl invocation may take before its SSH session is dropped. */
const BATCH_TIMEOUT_MS = 20_000;
/** Longest the serving host may take to print the override files. */
const READ_FILES_TIMEOUT_MS = 10_000;
/** Service repositories handled per run. */
const MAX_REPOS = 20;
/** Repositories with more tags than this are skipped (avoids paginated listings). */
const MAX_TAGS_PER_REPO = 500;
/** Manifests actually deleted per run; a larger backlog is worked off over several deploys. */
const MAX_DELETIONS_PER_RUN = 50;
/** Requests per curl invocation. */
const BATCH_SIZE = 100;
/** A "running" deployment older than this is a leftover, not a concurrent deploy. */
const RUNNING_DEPLOYMENT_WINDOW_MS = 2 * 60 * 60 * 1000;

class RetentionAbort extends Error {}

const LATEST_TAG = "latest";

/**
 * Composes with a prune in progress. Two deploys of one compose can finish
 * close together; their prunes must never overlap, or the second one could
 * delete a digest the first one has just decided to keep.
 */
const pruneInFlight = new Set<string>();

const hasConcurrentDeployment = (
	deployments: {
		deploymentId: string;
		createdAt: string;
		status: string | null;
	}[],
	currentDeploymentId?: string,
) => {
	const now = Date.now();
	return deployments.some(
		(candidate) =>
			candidate.deploymentId !== currentDeploymentId &&
			candidate.status === "running" &&
			now - Date.parse(candidate.createdAt) < RUNNING_DEPLOYMENT_WINDOW_MS,
	);
};

export interface RegistryRetentionEntity extends ComposePathLike {
	composeId: string;
	buildRegistryId: string | null;
}

const redact = (text: string, secret?: string | null) =>
	secret ? text.split(secret).join("***") : text;

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new RetentionAbort(`${label} timed out`)),
			ms,
		);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * Prunes old `dpl-` tags of `entity`'s service repositories in its build
 * registry. A no-op (no I/O at all) for a compose without a build server, so
 * every other unit behaves exactly as before.
 */
export const pruneComposeBuildRegistry = async ({
	entity,
	deployment,
	keep = BUILD_REGISTRY_KEEP_DPL_TAGS,
	budgetMs = RETENTION_BUDGET_MS,
}: {
	entity: RegistryRetentionEntity;
	deployment: { logPath: string; deploymentId?: string };
	keep?: number;
	budgetMs?: number;
}): Promise<void> => {
	const { buildServerId, buildRegistryId } = entity;
	if (!buildServerId || !buildRegistryId) return;
	if (process.env.DOKPLOY_DISABLE_BUILD_REGISTRY_RETENTION === "true") return;
	if (pruneInFlight.has(entity.composeId)) return;

	const log = createDeploymentLogWriter(entity.serverId ?? null, deployment.logPath);
	let password: string | null | undefined;
	let cancelled = false;
	pruneInFlight.add(entity.composeId);
	try {
		const registry = await findRegistryByIdWithCredentials(buildRegistryId);
		password = registry.password;

		if (registry.registryType === "awsEcr") {
			log.line(
				"Build registry cleanup skipped: AWS ECR registries are not pruned by Dokploy (use an ECR lifecycle policy).",
			);
			return;
		}
		const endpoint = parseRegistryEndpoint(registry.registryUrl);
		if (!endpoint) {
			log.line(
				"Build registry cleanup skipped: the build registry has no URL.",
			);
			return;
		}

		const deadline = Date.now() + budgetMs;
		const assertTime = () => {
			if (cancelled || Date.now() >= deadline) {
				throw new RetentionAbort("the time budget for cleanup ran out");
			}
		};

		/** One SSH session = one curl invocation on the build server. */
		const runBatch = async (requests: RegistryRequest[]) => {
			assertTime();
			let stdout = "";
			const session = await openRemoteInputSession(
				buildServerId,
				REGISTRY_CURL_COMMAND,
				{ onStdout: (text) => void (stdout += text) },
			);
			const timer = setTimeout(
				() => session.abort(),
				Math.max(1, Math.min(BATCH_TIMEOUT_MS, deadline - Date.now())),
			);
			try {
				try {
					await session.write(
						Buffer.from(
							buildRegistryCurlConfig({
								requests,
								username: registry.username,
								password: registry.password,
							}),
							"utf8",
						),
					);
				} catch {
					// The command may already be gone (no curl); `end` reports why.
				}
				await session.end();
			} finally {
				clearTimeout(timer);
			}
			if (stdout.includes(NO_CURL_MARKER)) {
				throw new RetentionAbort("curl is not installed on the build server");
			}
			return parseRegistryResponses(stdout);
		};

		/** Statuses that mean no further request can succeed. */
		const failIfSystemic = (status: number, action: string) => {
			if (status === 0) {
				throw new RetentionAbort(
					"the registry could not be reached from the build server",
				);
			}
			if (status === 401 || status === 403) {
				throw new RetentionAbort(
					`the registry refused the stored credentials (HTTP ${status}) while ${action}; token-authenticated registries are not supported`,
				);
			}
			if (status === 405 || status === 501) {
				throw new RetentionAbort(
					`the registry does not allow ${action} (HTTP ${status}); the v2 delete API is disabled or unsupported (registry:2 needs REGISTRY_STORAGE_DELETE_ENABLED=true)`,
				);
			}
		};

		const run = async () => {
			// 1. What the current release and the rollback snapshots reference.
			const overridePath = getComposeBuildOverridePath(entity);
			const backupDir = getComposeBackupDir(entity);
			const files = [
				overridePath,
				join(backupDir, LAST_GOOD_OVERRIDE_BAK),
				join(backupDir, PRE_DEPLOY_OVERRIDE_BAK),
			];
			const readFiles = getReadFilesCommand(files.map((file) => quote([file])));
			const { stdout: filesOutput } = await withTimeout(
				entity.serverId
					? execAsyncRemote(entity.serverId, readFiles)
					: execAsync(readFiles),
				READ_FILES_TIMEOUT_MS,
				"reading the release overrides",
			);
			const protectedByRepo = new Map<string, Set<string>>();
			for (const text of splitFileOutput(filesOutput)) {
				for (const image of parseOverrideImages(text)) {
					const ref = parseRegistryImageRef(image);
					if (!ref || ref.host !== endpoint.host) continue;
					const tags = protectedByRepo.get(ref.repo) ?? new Set<string>();
					tags.add(ref.tag);
					protectedByRepo.set(ref.repo, tags);
				}
			}
			if (protectedByRepo.size === 0) {
				log.line(
					"Build registry cleanup: the release overrides reference no images of this registry, nothing to prune.",
				);
				return;
			}
			if (protectedByRepo.size > MAX_REPOS) {
				throw new RetentionAbort(
					`the compose has ${protectedByRepo.size} service repositories (more than ${MAX_REPOS})`,
				);
			}

			// 2. Deployment times, and a guard against racing a concurrent deploy
			// of this compose (its tags may not be referenced by any file yet, and
			// an unchanged service pushed now shares a digest we might delete).
			const deployments = await findAllDeploymentsByComposeId(entity.composeId);
			if (hasConcurrentDeployment(deployments, deployment.deploymentId)) {
				log.line(
					"Build registry cleanup deferred: another deployment of this compose is running.",
				);
				return;
			}
			const tagTimes = mapDeploymentTagTimes(deployments);

			// 3. Find the registry's API address from the build server.
			const bases = getRegistryApiBases(endpoint);
			const probe = await runBatch(
				bases.map((base, id) => ({
					id,
					method: "GET" as const,
					url: `${base}/v2/`,
				})),
			);
			const reachable = bases.findIndex((_, id) => probe.get(id)?.status === 200);
			if (reachable === -1) {
				for (let id = 0; id < bases.length; id++) {
					failIfSystemic(probe.get(id)?.status ?? 0, "checking the API");
				}
				throw new RetentionAbort(
					"the registry did not answer the v2 API check as expected",
				);
			}
			const base = bases[reachable] as string;

			// 4. List the tags of every service repository. The listing is asked
			// for with its headers: a `Link` header means the registry paged or
			// truncated it, and a partial listing cannot tell us what is kept.
			const repos = [...protectedByRepo.keys()];
			const listings = await runBatch(
				repos.map((repo, id) => ({
					id,
					method: "GET" as const,
					url: getTagsListUrl(base, repo),
					includeHeaders: true,
				})),
			);
			interface RepoWork {
				repo: string;
				doomed: string[];
				/** Every tag that stays, plus the ones that must exist (see below). */
				resolve: string[];
				/** Tags an override file names; a 404 on one means the registry is not to be trusted. */
				required: Set<string>;
			}
			const work: RepoWork[] = [];
			for (const [id, repo] of repos.entries()) {
				const response = listings.get(id);
				const status = response?.status ?? 0;
				failIfSystemic(status, "listing tags");
				if (status === 404) continue;
				if (status !== 200 || !response) {
					log.line(
						`Warning: ⚠️ Build registry cleanup skipped ${repo}: listing tags returned HTTP ${status}.`,
					);
					continue;
				}
				if (response.headers.link) {
					log.line(
						`Warning: ⚠️ Build registry cleanup skipped ${repo}: the tag listing is paged or truncated.`,
					);
					continue;
				}
				let tags: string[] = [];
				try {
					const parsed = JSON.parse(response.body) as { tags?: unknown };
					tags = Array.isArray(parsed.tags)
						? parsed.tags.filter(
								(tag): tag is string =>
									typeof tag === "string" && isValidTag(tag),
							)
						: [];
				} catch {
					log.line(
						`Warning: ⚠️ Build registry cleanup skipped ${repo}: unreadable tag list.`,
					);
					continue;
				}
				if (tags.length > MAX_TAGS_PER_REPO) {
					log.line(
						`Warning: ⚠️ Build registry cleanup skipped ${repo}: more than ${MAX_TAGS_PER_REPO} tags.`,
					);
					continue;
				}
				const required = protectedByRepo.get(repo) ?? new Set<string>();
				const plan = planRepoTags({
					tags,
					protectedTags: required,
					tagTimes,
					keep,
				});
				if (plan.doomedTags.length > 0) {
					// Whatever the listing says, `latest` and every tag the release
					// files name are resolved too, so their digests are protected even
					// when the listing is stale or incomplete.
					work.push({
						repo,
						doomed: plan.doomedTags,
						resolve: [
							...new Set([...plan.keptTags, ...required, LATEST_TAG]),
						],
						required,
					});
				}
			}
			if (work.length === 0) return;

			// 5. Resolve digests: doomed tags with HEAD, every other tag with GET
			// (its manifest body also names the children of an image index).
			interface Resolve {
				id: number;
				repo: string;
				tag: string;
				doomed: boolean;
			}
			const resolves: Resolve[] = [];
			for (const item of work) {
				for (const tag of item.doomed) {
					resolves.push({
						id: resolves.length,
						repo: item.repo,
						tag,
						doomed: true,
					});
				}
				for (const tag of item.resolve) {
					resolves.push({
						id: resolves.length,
						repo: item.repo,
						tag,
						doomed: false,
					});
				}
			}
			const resolved = new Map<number, RegistryResponse>();
			for (let start = 0; start < resolves.length; start += BATCH_SIZE) {
				const chunk = resolves.slice(start, start + BATCH_SIZE);
				const responses = await runBatch(
					chunk.map((entry) => ({
						id: entry.id,
						method: entry.doomed ? ("HEAD" as const) : ("GET" as const),
						url: getManifestUrl(base, entry.repo, entry.tag),
						manifest: true,
						includeHeaders: !entry.doomed,
					})),
				);
				for (const [id, response] of responses) resolved.set(id, response);
			}

			// 6. Per repository: a digest may go only if no tag that stays points
			// at it (or at an index that contains it). A doomed tag that no longer
			// resolves (HEAD 404) is dangling: nothing to delete, nothing counted.
			const deletions: { repo: string; digest: string; tags: string[] }[] = [];
			for (const item of work) {
				const protectedDigests = new Set<string>();
				const doomedDigests = new Map<string, string>();
				let untrusted: string | null = null;
				for (const entry of resolves.filter((r) => r.repo === item.repo)) {
					const response = resolved.get(entry.id);
					const digest = response?.headers["docker-content-digest"];
					if (entry.doomed) {
						failIfSystemic(response?.status ?? 0, "reading manifests");
						if (response?.status === 200 && digest && isValidDigest(digest)) {
							doomedDigests.set(entry.tag, digest);
						}
						continue;
					}
					failIfSystemic(response?.status ?? 0, "reading manifests");
					if (response?.status === 404) {
						// `latest` may simply not exist when the listing did not have it.
						// Any other kept tag, and every tag a release file names, was
						// either listed or required: a 404 means the registry is
						// inconsistent, and what it protects is unknown.
						if (entry.tag === LATEST_TAG && !item.required.has(entry.tag)) {
							continue;
						}
						untrusted = `${entry.tag} (HTTP 404)`;
						break;
					}
					if (response?.status !== 200 || !digest || !isValidDigest(digest)) {
						untrusted = `${entry.tag} (HTTP ${response?.status ?? 0})`;
						break;
					}
					protectedDigests.add(digest);
					for (const child of getManifestChildDigests(response.body)) {
						protectedDigests.add(child);
					}
				}
				if (untrusted) {
					log.line(
						`Warning: ⚠️ Build registry cleanup skipped ${item.repo}: could not read the kept tag ${untrusted}.`,
					);
					continue;
				}
				const { deleteDigests } = selectDigestsToDelete({
					doomedDigests,
					protectedDigests,
				});
				for (const digest of deleteDigests) {
					deletions.push({
						repo: item.repo,
						digest,
						tags: [...doomedDigests]
							.filter(([, value]) => value === digest)
							.map(([tag]) => tag),
					});
				}
			}
			if (deletions.length === 0) return;

			// 7. Delete the manifests, oldest first. Before every batch look again
			// for a deploy that started while this ran: its pushes are the one thing
			// the checks above cannot see. Only manifests actually deleted count
			// against the per-run cap.
			let deleted = 0;
			let gone = 0;
			let failed = 0;
			let removedTags = 0;
			let next = 0;
			while (next < deletions.length && deleted < MAX_DELETIONS_PER_RUN) {
				if (
					hasConcurrentDeployment(
						await findAllDeploymentsByComposeId(entity.composeId),
						deployment.deploymentId,
					)
				) {
					log.line(
						"Build registry cleanup stopped: another deployment of this compose started.",
					);
					break;
				}
				const size = Math.min(BATCH_SIZE, MAX_DELETIONS_PER_RUN - deleted);
				const chunk = deletions.slice(next, next + size);
				next += chunk.length;
				const responses = await runBatch(
					chunk.map((entry, id) => ({
						id,
						method: "DELETE" as const,
						url: getManifestUrl(base, entry.repo, entry.digest),
					})),
				);
				for (const [id, entry] of chunk.entries()) {
					const status = responses.get(id)?.status ?? 0;
					if (status === 202) {
						deleted += 1;
						removedTags += entry.tags.length;
						continue;
					}
					if (status === 404) {
						gone += 1;
						continue;
					}
					failIfSystemic(status, "deleting manifests");
					failed += 1;
					log.line(
						`Warning: ⚠️ Build registry cleanup: deleting ${entry.repo}@${entry.digest.slice(0, 19)} returned HTTP ${status}.`,
					);
				}
			}
			if (deleted > 0 || failed > 0) {
				log.line(
					`Build registry cleanup: removed ${deleted} old image manifest${deleted === 1 ? "" : "s"} (${removedTags} dpl- tag${removedTags === 1 ? "" : "s"}) from ${work.length} repositor${work.length === 1 ? "y" : "ies"}, keeping the newest ${keep} per service${failed ? `; ${failed} failed` : ""}${gone ? `; ${gone} already gone` : ""}.`,
				);
			}
		};

		await withTimeout(run(), budgetMs, "build registry cleanup").catch(
			(error) => {
				cancelled = true;
				throw error;
			},
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.line(
			`Warning: ⚠️ Build registry cleanup did not complete: ${redact(message, password)}`,
		);
	} finally {
		pruneInFlight.delete(entity.composeId);
		await log.close();
	}
};
