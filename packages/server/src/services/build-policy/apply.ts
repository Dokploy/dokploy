import { posix } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { BuildPolicySettings } from "@dokploy/server/db/schema";
import {
	getRegistryTag,
	loginDockerRegistry,
} from "@dokploy/server/utils/cluster/upload";
import { encodeBase64 } from "@dokploy/server/utils/docker/utils";
import { sendBuildErrorNotifications } from "@dokploy/server/utils/notifications/build-error";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { getGitCommitInfo } from "@dokploy/server/utils/providers/git";
import { quote } from "shell-quote";
import { getDokployUrl } from "../admin";
import { updateApplicationStatus } from "../application";
import {
	createDeployment,
	updateDeployment,
	updateDeploymentStatus,
} from "../deployment";
import { findRegistryByIdWithCredentials } from "../registry";
import { recordBuildPolicyAudit } from "./audit";
import { BuildPolicyError } from "./errors";
import { waitForUnitRequiredChecks } from "./github-checks";
import {
	assertSafeImageReference,
	buildDigestRef,
	DIGEST_MARKER,
	parseImageDigestFromLog,
	parseImageTagFromLog,
} from "./image";
import type { BuildPolicyDecision } from "./policy";
import { assertBuildPolicyOk, resolveBuildPolicy } from "./resolve";
import { requiredChecksTimeoutMs } from "./settings";

/**
 * The deploy-path entry point for applications.
 *
 * `planApplicationBuild` is called once at the top of a deploy; everything the
 * deploy path needs afterwards is on the returned plan, so the upstream hook
 * points stay one or two lines each.
 */
export interface BuildPolicyPlan {
	/** Whether this deploy is pinned to the org build server. */
	enforced: boolean;
	/** Why not, when it is not enforced. Useful in logs and tests. */
	reason?: string;
	/** Build server to run the build on, or null to leave upstream alone. */
	buildServerId: string | null;
	/** Registry the image is pushed to and pulled from, when enforced. */
	registryId: string | null;
	/** Full repository reference (`host/prefix/app`) the sha tag hangs off. */
	repository: string | null;
	/**
	 * The organization settings this plan was decided from, so the rest of the
	 * deploy never reads them a second time.
	 */
	settings: BuildPolicySettings | null;
}

interface PlanUnit {
	unitId: string;
	unitName: string;
	appName: string;
	/**
	 * Null when the loaded row carried no nested environment. The fork must not
	 * be the reason a deploy throws, so that case plans as unenforced rather
	 * than dereferencing its way to a crash. See `planApplicationBuild`.
	 */
	organizationId: string | null;
	sourceType: string;
	customGitUrl?: string | null;
	buildServerId?: string | null;
	buildRegistryId?: string | null;
}

/**
 * The registry object `getAuthConfig` expects on `application.buildRegistry`:
 * every column except the password, which it re-reads itself. ECR needs
 * `awsSecretAccessKey` present, so `findRegistryById` is not enough.
 */
export const registryForAuth = async (registryId: string) => {
	const { password, ...rest } =
		await findRegistryByIdWithCredentials(registryId);
	return rest;
};

/**
 * The registry fields to spread onto the application object handed to
 * `mechanizeDockerContainer`, so the deploy host authenticates against the
 * registry the digest **actually lives on**.
 *
 * Round-2 review finding D. Both pin sites used to only *fill in*
 * `buildRegistry` when the unit had none, and never touched `registry`. But
 * `getAuthConfig` (`utils/builders/index.ts`) tests `registry` in an `else if`
 * that precedes the `else if (buildRegistry)` branch, so a non-null `registry`
 * wins and `buildRegistry` is never consulted. A unit carrying a stale
 * `registryId` from a previous Docker-provider configuration — the column is not
 * cleared on a source-type change — therefore pulled the org registry's digest
 * with the other registry's credentials, and failed at the swarm update.
 *
 * So when there is a policy registry, it is authoritative for this deploy:
 * `registry` is nulled and `buildRegistry` carries it. When there is not,
 * nothing is changed and the unit's own configuration stands.
 *
 * `registry` is nulled rather than overwritten because `getAuthConfig`'s
 * `sourceType === "docker"` branch also reads it, and this application is not
 * being deployed from a Docker source; the `buildRegistry` branch is the one
 * that means "the registry this build published to".
 */
export const authForPublishedRegistry = async (
	registryId: string | null,
): Promise<{ registry?: null; buildRegistry?: unknown }> => {
	if (!registryId) return {};
	return { registry: null, buildRegistry: await registryForAuth(registryId) };
};

const LOCAL_PLAN = (
	reason: string,
	settings: BuildPolicySettings | null,
): BuildPolicyPlan => ({
	enforced: false,
	reason,
	buildServerId: null,
	registryId: null,
	repository: null,
	settings,
});

/**
 * Adapter from a loaded application row to the policy input, so the upstream
 * call sites never have to know which fields the policy reads.
 */
export const toBuildPolicyUnit = (application: {
	applicationId: string;
	appName: string;
	name: string;
	sourceType: string;
	customGitUrl?: string | null;
	buildServerId?: string | null;
	buildRegistryId?: string | null;
	environment?: { project?: { organizationId?: string | null } | null } | null;
}): PlanUnit => ({
	unitId: application.applicationId,
	unitName: application.name,
	appName: application.appName,
	// `findApplicationById` always nests the environment, so this is a belt on
	// top of braces: a deploy must never fail because the fork reached through
	// a field a caller did not load.
	organizationId: application.environment?.project?.organizationId ?? null,
	sourceType: application.sourceType,
	customGitUrl: application.customGitUrl,
	buildServerId: application.buildServerId,
	buildRegistryId: application.buildRegistryId,
});

/**
 * A refused plan (`NO_BUILD_SERVER` / `NO_REGISTRY`) has to be visible where a
 * team already looks: a deployment row in `error`, the application in `error`,
 * and a build-failure notification (spec §7 requires the notification).
 *
 * The plan has to run *before* `createDeployment`, because the deployment's log
 * file is created on whichever host is going to build — so on refusal this
 * creates the deployment itself, marks it failed and notifies, then the caller
 * rethrows.
 */
export const reportBuildPolicyPlanFailure = async ({
	application,
	titleLog,
	descriptionLog,
	error,
}: {
	application: {
		applicationId: string;
		appName: string;
		name: string;
		serverId: string | null;
		environment: {
			projectId: string;
			project: { name: string; organizationId: string };
		};
	};
	titleLog: string;
	descriptionLog: string;
	error: unknown;
}): Promise<void> => {
	const message = error instanceof Error ? error.message : String(error);
	try {
		const deployment = await createDeployment({
			applicationId: application.applicationId,
			title: titleLog,
			description: descriptionLog,
		});

		const command = `echo "${encodeBase64(`\n❌ [build-policy] ${message}\n`)}" | base64 -d >> "${deployment.logPath}";`;
		try {
			if (application.serverId) {
				await execAsyncRemote(application.serverId, command);
			} else {
				await execAsync(command);
			}
		} catch (logError) {
			// An unreachable host must not cost the team the notification, which is
			// the only other place a refused deploy surfaces.
			console.error(
				"[build-policy] could not append the refusal to the deployment log",
				logError,
			);
		}

		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateApplicationStatus(application.applicationId, "error");
		await sendBuildErrorNotifications({
			projectName: application.environment.project.name,
			applicationName: application.name,
			applicationType: "application",
			errorMessage: message,
			buildLink: `${await getDokployUrl()}/dashboard/project/${application.environment.projectId}/services/application/${application.applicationId}?tab=deployments`,
			organizationId: application.environment.project.organizationId,
		});
	} catch (reportingError) {
		// Reporting must never mask the policy error the caller is about to throw.
		console.error(
			"[build-policy] could not record the refused deploy",
			reportingError,
		);
	}
};

export const planApplicationBuild = async (
	unit: PlanUnit,
): Promise<BuildPolicyPlan> => {
	if (!unit.organizationId) {
		// No organization means no settings row to read, which is the same
		// answer as the policy being off. Warn rather than fail: refusing the
		// deploy here would turn an unloaded relation into an outage.
		console.warn(
			`[build-policy] no organization on unit ${unit.unitId}; leaving the build alone`,
		);
		return LOCAL_PLAN("no_organization", null);
	}
	const { decision, settings } = await resolveBuildPolicy({
		unitType: "application",
		unitId: unit.unitId,
		unitName: unit.unitName,
		organizationId: unit.organizationId,
		sourceType: unit.sourceType,
		customGitUrl: unit.customGitUrl,
		buildServerId: unit.buildServerId,
		buildRegistryId: unit.buildRegistryId,
	});

	const ok = assertBuildPolicyOk(decision) as Exclude<
		BuildPolicyDecision,
		{ mode: "error" }
	>;

	if (ok.mode === "local") {
		return LOCAL_PLAN(ok.reason, settings);
	}

	const registry = await findRegistryByIdWithCredentials(ok.registryId);
	return {
		enforced: true,
		buildServerId: ok.buildServerId,
		registryId: ok.registryId,
		repository: getRegistryTag(registry, unit.appName),
		settings,
	};
};

/**
 * Shell appended to the build command, on the build server, after the image has
 * been built. Tags `<repository>:<sha>`, pushes, and echoes the resulting
 * digest so the deploy step can pin it.
 *
 * The sha is resolved in the shell (`git rev-parse HEAD`) rather than passed
 * in, because a manual redeploy has no webhook payload to read it from.
 */
export const getBuildPolicyPushCommand = async (
	plan: BuildPolicyPlan,
	{ appName, serverId }: { appName: string; serverId: string | null },
): Promise<string> => {
	if (!plan.enforced || !plan.registryId || !plan.repository) return "";

	const registry = await findRegistryByIdWithCredentials(plan.registryId);
	// Logged in on the build host ahead of the script, so the password travels
	// on stdin instead of in the script's command line.
	await loginDockerRegistry(registry, serverId);

	const { APPLICATIONS_PATH } = paths(!!serverId);
	// posix.join: the shell always runs on the Linux build host, so the path
	// must use forward slashes even when Dokploy itself runs on Windows.
	const codeDir = posix.join(APPLICATIONS_PATH, appName, "code");
	const repository = plan.repository;

	return `
echo ${quote([`🏷️  [build-policy] Publishing ${repository}:<sha> to the organization registry`])} ;
DOKPLOY_BP_SHA=$(git -C ${quote([codeDir])} rev-parse HEAD 2>/dev/null || echo "") ;
if [ -z "$DOKPLOY_BP_SHA" ]; then
	echo "❌ [build-policy] Could not resolve the commit sha, so the image cannot be tagged by sha" ;
	exit 1;
fi
DOKPLOY_BP_TAG=${quote([repository])}:"$DOKPLOY_BP_SHA" ;
docker tag ${quote([`${appName}:latest`])} "$DOKPLOY_BP_TAG" || {
	echo "❌ [build-policy] Tagging the image by sha failed" ;
	exit 1;
}
docker push "$DOKPLOY_BP_TAG" || {
	echo "❌ [build-policy] Pushing the image to the organization registry failed" ;
	exit 1;
}
DOKPLOY_BP_DIGEST=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$DOKPLOY_BP_TAG" | grep -F ${quote([`${repository}@`])} | head -n1 | cut -d@ -f2) ;
if [ -z "$DOKPLOY_BP_DIGEST" ]; then
	echo "❌ [build-policy] Could not read the digest of the pushed image" ;
	exit 1;
fi
echo "${DIGEST_MARKER} $DOKPLOY_BP_TAG $DOKPLOY_BP_DIGEST" ;
echo "✅ [build-policy] Pushed $DOKPLOY_BP_TAG@$DOKPLOY_BP_DIGEST" ;
`;
};

export interface PublishedImage {
	tag: string;
	digest: string;
	/** `repository@sha256:…` — what the swarm service is pinned to. */
	ref: string;
}

/**
 * Reads back the digest the build shell echoed. The build runs detached on the
 * build server, so the deployment log is the only channel it has.
 */
export const readPublishedImage = async ({
	logPath,
	serverId,
	expectedRepository,
}: {
	logPath: string;
	serverId: string | null;
	/**
	 * The only repository this deploy may be pinned to. The log being grepped
	 * also carries the repository's own `docker build` output, so a Dockerfile
	 * could print a forged marker naming somewhere else; `set -e` happens to put
	 * the genuine marker last today, but the deploy must not rest on that.
	 */
	expectedRepository: string;
}): Promise<PublishedImage | null> => {
	const command = `grep -F ${quote([DIGEST_MARKER])} ${quote([logPath])} | tail -n 1`;
	let stdout = "";
	try {
		const result = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);
		stdout = result.stdout ?? "";
	} catch (error) {
		// `grep` exits 1 when it matches nothing; that is "no digest", not a crash.
		console.error("[build-policy] could not read the published digest", error);
		return null;
	}

	const tag = parseImageTagFromLog(stdout);
	const digest = parseImageDigestFromLog(stdout);
	if (!tag || !digest) return null;

	if (!tag.startsWith(`${expectedRepository}:`)) {
		console.error(
			`[build-policy] ignoring a published-image marker for "${tag}"; this deploy publishes "${expectedRepository}"`,
		);
		return null;
	}
	try {
		assertSafeImageReference(tag);
	} catch (error) {
		console.error(
			"[build-policy] published-image marker is not a safe reference",
			error,
		);
		return null;
	}

	return { tag, digest, ref: buildDigestRef(tag, digest) };
};

/**
 * The whole post-build half of an enforced deploy: read the digest, refuse to
 * continue without one, and audit the pin.
 */
export const requirePublishedImage = async ({
	plan,
	logPath,
	serverId,
	organizationId,
	applicationId,
	unitName,
}: {
	plan: BuildPolicyPlan;
	logPath: string;
	serverId: string | null;
	organizationId: string;
	applicationId: string;
	unitName: string;
}): Promise<PublishedImage> => {
	const published = await readPublishedImage({
		logPath,
		serverId,
		expectedRepository: plan.repository ?? "",
	});
	if (!published) {
		throw new BuildPolicyError(
			"DIGEST_NOT_PUBLISHED",
			"The remote build finished but published no image digest, so the deploy " +
				"cannot be pinned. Check the build log for the registry push step.",
			{ applicationId, repository: plan.repository },
		);
	}

	await recordBuildPolicyAudit({
		organizationId,
		action: "deploy_by_digest",
		applicationId,
		metadata: {
			unitName,
			imageTag: published.tag,
			imageDigest: published.digest,
		},
	});

	return published;
};

/** The prefix every generated deploy command opens with. */
const SHELL_PREFIX = "set -e;";

interface RequiredChecksGateUnit {
	applicationId: string;
	appName: string;
	name: string;
	sourceType: string;
	owner?: string | null;
	repository?: string | null;
	customGitUrl?: string | null;
	githubId?: string | null;
	requiredChecks?: string[] | null;
	environment?: {
		project?: { organizationId?: string | null } | null;
	} | null;
}

/**
 * The `requiredChecks` gate, run **between the clone and the build**.
 *
 * Round-2 review finding E. This wait used to live in
 * `prepareBuildPolicyDeploy`, after the build, and it entered on a non-empty
 * `requiredChecks` alone with no policy switch involved. Two consequences, both
 * fixed here:
 *
 * - **It cost a whole build.** The image had already been built, tagged and
 *   pushed to the organization registry by the time the gate ran, so a check
 *   that failed or never arrived bought back no compute at all. For a fork
 *   whose point is cutting CI compute, gating after the build is the expensive
 *   ordering. The gate now runs on the sha the clone just fetched, so a refused
 *   check costs one clone.
 * - **It was not policy-gated.** It now does nothing unless the organization
 *   has `enforceRemoteBuilds` on, so `requiredChecks` can no longer change what
 *   a deploy does on an instance where nobody enabled the policy. It is still
 *   honoured for a unit the policy left *local* — an exclusion decides where a
 *   unit builds, not whether its team gave up its CI gate.
 *
 * **What is still true and has to be planned for:** the wait occupies the
 * deployment slot it is running in. On a self-hosted instance `jobData.serverId`
 * is only ever set under `IS_CLOUD`, so every deployment job lands in the single
 * `LOCAL_PARTITION` whose concurrency is `buildsConcurrency ?? 1`. Raise
 * `buildsConcurrency` before enabling checks on a busy instance, and keep the
 * timeout short. Moving the wait out of the queue entirely means not enqueueing
 * until the checks pass, which is a queue redesign rather than a hook; see the
 * README's required-checks section.
 *
 * Returns the command string the caller should carry on appending to. When the
 * gate is inactive that is the caller's own string, unchanged and unexecuted,
 * so the built command stays byte-identical to upstream's.
 */
export const runBuildPolicyPreBuildGate = async ({
	application,
	plan,
	deployment,
	serverId,
	command,
	appName,
}: {
	application: RequiredChecksGateUnit;
	plan: BuildPolicyPlan;
	deployment: { logPath: string };
	serverId: string | null;
	command: string;
	/** The checkout directory to read the sha from; a preview uses its own. */
	appName?: string;
}): Promise<string> => {
	const requiredChecks = (application.requiredChecks ?? []).filter(
		(name): name is string =>
			typeof name === "string" && name.trim().length > 0,
	);
	if (requiredChecks.length === 0) return command;

	// The policy switch. Without it a `requiredChecks` value alone gated deploys
	// on an instance where nobody turned the policy on.
	if (!plan.settings?.enforceRemoteBuilds) return command;

	const organizationId = application.environment?.project?.organizationId;
	if (!organizationId) {
		console.warn(
			`[build-policy] no organization on application ${application.applicationId}; skipping the required-checks gate`,
		);
		return command;
	}

	// Run the clone half now, so the gate reads the commit this deploy is
	// actually about rather than whatever was checked out last time. A rebuild
	// has no clone — its command is still the bare `set -e;` prefix — so there
	// is nothing to run and the existing checkout is already the right one.
	if (command.replace(SHELL_PREFIX, "").trim().length > 0) {
		const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (serverId) {
			await execAsyncRemote(serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}
	}

	const sha =
		(
			await getGitCommitInfo({
				appName: appName ?? application.appName,
				type: "application",
				serverId,
			})
		)?.hash || null;

	await waitForUnitRequiredChecks({
		unit: {
			unitType: "application",
			unitId: application.applicationId,
			unitName: application.name,
			organizationId,
			requiredChecks,
			sourceType: application.sourceType,
			githubId: application.githubId,
			owner: application.owner,
			repository: application.repository,
			customGitUrl: application.customGitUrl,
		},
		sha,
		// Already read when the plan was made; never read twice per deploy.
		timeoutMs: requiredChecksTimeoutMs(plan.settings),
	});

	// The clone is done; the caller starts the build half from a clean shell.
	// Every generated build command addresses absolute paths or does its own
	// `cd`, so nothing depends on a working directory the clone half left behind.
	return SHELL_PREFIX;
};

/**
 * Everything an enforced deploy does between "the build finished" and "update
 * the swarm service": read the published digest, store it on the deployment
 * record, and hand back the application object the deploy step should use.
 *
 * Required checks are **not** here any more; they run before the build, in
 * `runBuildPolicyPreBuildGate` above.
 *
 * Returns the application unchanged when the policy is not enforcing, so the
 * upstream call site is a single assignment either way.
 */
export const prepareBuildPolicyDeploy = async <
	T extends {
		applicationId: string;
		appName: string;
		name: string;
		sourceType: string;
		owner?: string | null;
		repository?: string | null;
		customGitUrl?: string | null;
		githubId?: string | null;
		requiredChecks?: string[] | null;
		buildRegistry?: unknown;
		environment?: {
			project?: { organizationId?: string | null } | null;
		} | null;
	},
>({
	application,
	plan,
	deployment,
	serverId,
}: {
	application: T;
	plan: BuildPolicyPlan;
	deployment: { deploymentId: string; logPath: string };
	serverId: string | null;
}): Promise<T & { buildPolicyImage?: string | null }> => {
	// Nothing to do. Return before any query or remote exec, so a deploy with
	// the policy off costs exactly what it costs on upstream. The organization
	// is read after this, so an unenforced deploy does not even touch it.
	if (!plan.enforced) return application;

	const organizationId = application.environment?.project?.organizationId;
	if (!organizationId) {
		// Same reasoning as `planApplicationBuild`: without an organization there
		// is nothing to enforce against, and the fork must not be the reason a
		// deploy throws.
		console.warn(
			`[build-policy] no organization on application ${application.applicationId}; deploying unchanged`,
		);
		return application;
	}

	const published = await requirePublishedImage({
		plan,
		logPath: deployment.logPath,
		serverId,
		organizationId,
		applicationId: application.applicationId,
		unitName: application.name,
	});

	await updateDeployment(deployment.deploymentId, {
		imageTag: published.tag,
		imageDigest: published.digest,
	});

	return {
		...application,
		buildPolicyImage: published.ref,
		...(await authForPublishedRegistry(plan.registryId)),
	};
};
