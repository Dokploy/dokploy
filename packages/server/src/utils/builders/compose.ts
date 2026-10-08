import { dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { InferResultType } from "@dokploy/server/types/with";
import boxen from "boxen";
import { quote } from "shell-quote";
import { writeDomainsToCompose } from "../docker/domain";
import {
	encodeBase64,
	getEnvironmentVariablesObject,
	prepareEnvironmentVariables,
	prepareEnvironmentVariablesForFile,
} from "../docker/utils";
import { withResolvedVaultRefs } from "../vault";

export type ComposeNested = InferResultType<
	"compose",
	{ environment: { with: { project: true } }; mounts: true; domains: true }
>;

/**
 * Emitted by the generated deploy script on the line right after a failed
 * `docker compose up` was rolled back to the previous release *and* the
 * on-disk compose/env files were restored. `didRollbackSucceed` greps the
 * deployment log for this marker to decide whether the service is still live.
 * The deployment id is appended so a marker left behind by an older deployment
 * in a reused log file can never be mistaken for the current one.
 */
export const ROLLBACK_OK_MARKER = "__DOKPLOY_ROLLBACK_OK__";

/**
 * Minimal shape needed to resolve the on-disk paths of a compose service.
 * Accepts both `Compose` rows and the nested/overridden entities used by
 * previews (whose `appName` is swapped for the isolated preview app name).
 */
export type ComposePathLike = {
	appName: string;
	sourceType: string;
	composePath: string;
	serverId?: string | null;
	/** Set when the images are built on a build server (see compose-remote-build). */
	buildServerId?: string | null;
};

/**
 * Absolute path of the compose file the deploy actually runs (`-f`).
 * Mirrors `getComposePath` in utils/docker/domain: raw services always write
 * their compose file to `<code>/docker-compose.yml`, whatever `composePath`
 * says. Duplicated here (instead of imported) to keep this module free of a
 * dependency on the domain helpers, which several tests stub out wholesale.
 */
export const getComposeFilePath = (compose: ComposePathLike) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const path =
		compose.sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
	return join(COMPOSE_PATH, compose.appName, "code", path);
};

/**
 * Absolute path of the generated `.env`. Deliberately derived from
 * `composePath` (not from `getComposeFilePath`) because that is what both
 * `getCreateEnvFileCommand` writes and `createCommand`'s `--env-file` points
 * at; the two only differ for raw services with a nested `composePath`.
 */
export const getComposeEnvFilePath = (compose: ComposePathLike) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const composeFilePath = join(
		COMPOSE_PATH,
		compose.appName,
		"code",
		compose.composePath || "docker-compose.yml",
	);
	return join(dirname(composeFilePath), ".env");
};

/**
 * Directory holding the transactional-deploy snapshots. It lives next to
 * `code/` (not inside it) so a `git clone` / raw-file rewrite of the code
 * directory never wipes the snapshot we are about to roll back to.
 */
export const getComposeBackupDir = (compose: ComposePathLike) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	return join(COMPOSE_PATH, compose.appName, ".deploy-backup");
};

/**
 * Name of the generated compose override that points every service built on a
 * build server at the image that was pushed for it.
 */
export const COMPOSE_BUILD_OVERRIDE_FILE = "docker-compose.dokploy-build.yml";

/**
 * Absolute path of the build override on the serving host. It lives next to
 * `code/` (not inside it) so a `git clone` of the code directory can never
 * delete the file the running release was started with.
 */
export const getComposeBuildOverridePath = (compose: ComposePathLike) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	return join(COMPOSE_PATH, compose.appName, COMPOSE_BUILD_OVERRIDE_FILE);
};

/** Snapshot of the release that was on disk when this deploy started. */
export const PRE_DEPLOY_COMPOSE_BAK = "docker-compose.yml.bak";
export const PRE_DEPLOY_ENV_BAK = "env.bak";
export const PRE_DEPLOY_OVERRIDE_BAK = `${COMPOSE_BUILD_OVERRIDE_FILE}.bak`;
/** Snapshot of the last release that actually deployed successfully. */
export const LAST_GOOD_COMPOSE_BAK = "last-good-docker-compose.yml.bak";
export const LAST_GOOD_ENV_BAK = "last-good-env.bak";
export const LAST_GOOD_OVERRIDE_BAK = `last-good-${COMPOSE_BUILD_OVERRIDE_FILE}.bak`;

/**
 * Shell snippet that snapshots the release currently on disk (compose file and
 * `.env`) into the backup directory. Must run *before* anything rewrites the
 * code directory, otherwise there is nothing left to roll back to.
 *
 * `|| exit 1` on purpose: a deploy that could not take its snapshot must abort
 * rather than mutate the code directory untransactionally. Stale snapshots are
 * removed when the corresponding file is absent so a rollback can never mix a
 * fresh compose file with an old `.env`.
 *
 * Every interpolated path goes through shell-quote: `composePath` and `appName`
 * are user-controlled fields.
 */
export const getBackupCurrentDeploymentCommand = (compose: ComposePathLike) => {
	const backupDir = getComposeBackupDir(compose);
	const qBackupDir = quote([backupDir]);
	const qComposeFile = quote([getComposeFilePath(compose)]);
	const qEnvFile = quote([getComposeEnvFilePath(compose)]);
	const qComposeBak = quote([join(backupDir, PRE_DEPLOY_COMPOSE_BAK)]);
	const qEnvBak = quote([join(backupDir, PRE_DEPLOY_ENV_BAK)]);

	// A release deployed through a build server is only restorable together with
	// the override that pins its images, so that file is part of the snapshot.
	let overrideSnapshot = "";
	if (compose.buildServerId) {
		const qOverrideFile = quote([getComposeBuildOverridePath(compose)]);
		const qOverrideBak = quote([join(backupDir, PRE_DEPLOY_OVERRIDE_BAK)]);
		overrideSnapshot = `if [ -f ${qOverrideFile} ]; then cp ${qOverrideFile} ${qOverrideBak} || exit 1; else rm -f ${qOverrideBak}; fi
`;
	}

	return `
mkdir -p ${qBackupDir} 2>/dev/null || exit 1;
if [ -f ${qComposeFile} ]; then cp ${qComposeFile} ${qComposeBak} || exit 1; else echo "No previous compose file found"; rm -f ${qComposeBak}; fi
if [ -f ${qEnvFile} ]; then cp ${qEnvFile} ${qEnvBak} || exit 1; else echo "No previous env file found"; rm -f ${qEnvBak}; fi
${overrideSnapshot}	`;
};

/**
 * Shell snippet that looks for one specific deployment's rollback marker in
 * its own log file. Anchored (`^...$`) and bound to the deployment id so a
 * marker left by an earlier deployment can never be mistaken for this one's.
 */
export const getRollbackMarkerProbeCommand = (
	logPath: string,
	deploymentId: string,
) =>
	`if grep -q ${quote([`^${ROLLBACK_OK_MARKER}:${deploymentId}$`])} ${quote([logPath])} 2>/dev/null; then echo "LIVE_OK"; else echo "LIVE_FAILED"; fi`;

export interface BuildComposeCommandOptions {
	/**
	 * Deployment the command belongs to. Required for the rollback marker to be
	 * attributable; when omitted the transactional wrapper is still emitted but
	 * the marker carries no id and `didRollbackSucceed` will not match it.
	 */
	deploymentId?: string;
	/**
	 * Set when the caller already ran `docker compose down --volumes` before
	 * this build. A fresh-volumes deploy is intentionally destructive and has
	 * no restorable pre-state, so the transactional wrapper is switched off.
	 */
	freshVolumes?: boolean;
	/**
	 * Result of building the images on the compose's build server. Required when
	 * `compose.buildServerId` is set: the serving host then only logs in, pulls
	 * and runs (`up --no-build`), and refuses to build on its own.
	 */
	remoteBuild?: RemoteBuildDeployInfo;
}

/** One service whose image was built on the build server and pushed. */
export interface RemoteBuildImage {
	service: string;
	/** Registry reference the serving host pulls and runs. */
	image: string;
}

export interface RemoteBuildDeployInfo {
	images: RemoteBuildImage[];
	/** Human readable name of the serving host, for the deployment log. */
	servingHostLabel: string;
}

/** Name of the compose's build server for user-facing messages. */
const getBuildServerLabel = (compose: ComposeNested) => {
	const name = (compose as { buildServer?: { name?: string | null } | null })
		.buildServer?.name;
	return name ? `build server ${name}` : "the build server";
};

/**
 * Shell snippet that restores the compose file, the `.env` and (for a compose
 * deployed through a build server) the build override from the snapshots, then
 * re-runs the previous release. Empty when the deploy is not transactional.
 *
 * Shared by the deploy script (docker command failed) and by the caller that
 * fails before the deploy script even starts (the build server stage), so both
 * leave the serving host in exactly the same state.
 */
const getRestoreCommands = (
	compose: ComposeNested,
	{
		command,
		deploymentId,
		isTransactional,
		exportEnvCommand,
		projectPath,
	}: {
		command: string;
		deploymentId?: string;
		isTransactional: boolean;
		exportEnvCommand: string;
		projectPath: string;
	},
) => {
	if (!isTransactional) return "";
	const backupDir = getComposeBackupDir(compose);
	const qComposeFile = quote([getComposeFilePath(compose)]);
	const qEnvFile = quote([getComposeEnvFilePath(compose)]);
	const qPreCompose = quote([join(backupDir, PRE_DEPLOY_COMPOSE_BAK)]);
	const qPreEnv = quote([join(backupDir, PRE_DEPLOY_ENV_BAK)]);
	const qLastGoodCompose = quote([join(backupDir, LAST_GOOD_COMPOSE_BAK)]);
	const qLastGoodEnv = quote([join(backupDir, LAST_GOOD_ENV_BAK)]);
	const qRollbackMarker = quote([
		deploymentId ? `${ROLLBACK_OK_MARKER}:${deploymentId}` : ROLLBACK_OK_MARKER,
	]);

	// The restore re-runs the very command that deploys, minus the flags that
	// would rebuild or re-pull: the restored release is a known-good artifact,
	// and `--pull always` is frequently the thing that broke the deploy in the
	// first place.
	const stripFlags = (value: string) =>
		value.replace(/ --build\b/g, "").replace(/ --pull always\b/g, "");
	const restoreCommand = stripFlags(command);

	// When the service generates its own `.env`, a restore that could not put
	// the previous `.env` back is not a real rollback — the restored compose
	// file would run against the new (possibly broken) environment.
	const isEnvRequired = compose.createEnvFile ? "1" : "0";

	// `failureMessage` is only ever overridden by the build-server branch; the
	// default stays the literal string every other compose has always logged.
	const runRestore = (restoreArgs: string, failureMessage?: string) =>
		`env -i PATH="$PATH" HOME="$HOME" ${exportEnvCommand} docker ${restoreArgs} 2>&1 && echo ${qRollbackMarker} || echo ${failureMessage ? quote([failureMessage]) : '"Warning: ⚠️ Automatic restore failed, manual intervention may be required"'};`;

	let upRestore = runRestore(restoreCommand);
	let overrideRestore = "";
	if (compose.buildServerId) {
		// No override could be put back: the previous release predates the build
		// server, or it had no `build:` services (so no override was ever written).
		// It still must not be rebuilt here: a plain `up` builds any service whose
		// image was pruned since, which a unit with a build server promises never
		// to do on its serving host. `--no-build` brings it back from the images
		// still on this host (or pulls them). If that fails the cause is unknown
		// (pruned images, registry outage, port conflict...), so the message below
		// stays neutral instead of blaming a missing image.
		const qOverrideFile = quote([getComposeBuildOverridePath(compose)]);
		const qPreOverride = quote([join(backupDir, PRE_DEPLOY_OVERRIDE_BAK)]);
		const qLastGoodOverride = quote([join(backupDir, LAST_GOOD_OVERRIDE_BAK)]);
		const plainCommand = `${stripFlags(
			createCommand({ ...compose, buildServerId: null }, projectPath),
		)} --no-build`;
		const buildServerLabel = getBuildServerLabel(compose);
		const noBuildRestoreFailure = `Warning: ⚠️ Automatic restore failed. The serving host never builds images (${buildServerLabel}). If this release's images were pruned, redeploy to rebuild them on ${buildServerLabel}; otherwise manual intervention may be required. Some services may already be restarted.`;
		overrideRestore = `
		OVERRIDE_RESTORED=1;
		cp ${qLastGoodOverride} ${qOverrideFile} 2>/dev/null || cp ${qPreOverride} ${qOverrideFile} 2>/dev/null || { OVERRIDE_RESTORED=0; rm -f ${qOverrideFile}; };`;
		upRestore = `if [ "$OVERRIDE_RESTORED" = "1" ]; then
				${runRestore(restoreCommand)}
			else
				${runRestore(plainCommand, noBuildRestoreFailure)}
			fi`;
	}

	return `
		echo "Restoring previous working deployment... ⏪";
		RESTORE_FILES_OK=1;
		cp ${qLastGoodCompose} ${qComposeFile} 2>/dev/null || cp ${qPreCompose} ${qComposeFile} 2>/dev/null || RESTORE_FILES_OK=0;
		RESTORE_ENV_OK=1;
		cp ${qLastGoodEnv} ${qEnvFile} 2>/dev/null || cp ${qPreEnv} ${qEnvFile} 2>/dev/null || RESTORE_ENV_OK=0;${overrideRestore}
		if [ "$RESTORE_ENV_OK" = "0" ] && { [ "${isEnvRequired}" = "1" ] || [ -f ${qLastGoodEnv} ] || [ -f ${qPreEnv} ]; }; then RESTORE_FILES_OK=0; echo "Warning: ⚠️ Previous .env could not be restored"; fi
		if [ "$RESTORE_FILES_OK" = "1" ]; then
			${upRestore}
		else
			echo "Warning: ⚠️ No previous release to restore, leaving the stack as-is";
		fi
		`;
};

/**
 * Restore script for a deploy that failed *before* the deploy script ran (the
 * build on the build server). The running containers were never touched, but
 * the clone already replaced the compose file and `.env`, so put the previous
 * release's files back and confirm it is still serving. Same markers as a
 * failed `docker compose up`, so `didRollbackSucceed` treats it identically.
 */
export const getRestoreAfterFailedBuildCommand = async (
	rawCompose: ComposeNested,
	options: { deploymentId?: string; freshVolumes?: boolean } = {},
) => {
	const compose = await withResolvedVaultRefs(rawCompose);
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");
	const isTransactional =
		compose.composeType === "docker-compose" && !options.freshVolumes;
	const effectiveProjectPath = compose.mounts.length > 0 ? projectPath : "";
	const restore = getRestoreCommands(compose, {
		command: createCommand(compose, effectiveProjectPath || undefined, {
			overridePath: getComposeBuildOverridePath(compose),
		}),
		deploymentId: options.deploymentId,
		isTransactional,
		exportEnvCommand: getExportEnvCommand(compose),
		projectPath: effectiveProjectPath,
	});
	if (!restore) return restore;
	// The deploy script runs from the code directory (it `cd`s there before the
	// docker command) and the restored `-f` / `--env-file` paths are relative to
	// it. This script runs as a step of its own, so it has to change there too.
	return `cd ${quote([projectPath])} 2>/dev/null || true;${restore}`;
};

export const getBuildComposeCommand = async (
	rawCompose: ComposeNested,
	options: BuildComposeCommandOptions = {},
) => {
	const { deploymentId, freshVolumes = false, remoteBuild } = options;
	const compose = await withResolvedVaultRefs(rawCompose);
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const { sourceType, appName, mounts, composeType, domains } = compose;
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");
	if (compose.buildServerId && !remoteBuild) {
		// Fail closed: a compose that opted into a build server must never fall
		// back to building on the serving host.
		throw new Error(
			"This compose builds on a build server, but no remote build result was provided; refusing to build on the serving host.",
		);
	}
	const command = createCommand(
		compose,
		mounts.length > 0 ? projectPath : undefined,
		remoteBuild
			? {
					overridePath:
						remoteBuild.images.length > 0
							? getComposeBuildOverridePath(compose)
							: undefined,
				}
			: undefined,
	);
	const envCommand = compose.createEnvFile
		? getCreateEnvFileCommand(compose)
		: "";
	const exportEnvCommand = getExportEnvCommand(compose);

	const newCompose = await writeDomainsToCompose(compose, domains);
	const logContent = `
App Name: ${appName}
Build Compose 🐳
Detected: ${mounts.length} mounts 📂
Command: docker ${command}
Source Type: docker ${sourceType} ✅
Compose Type: ${composeType} ✅`;

	const logBox = boxen(logContent, {
		padding: {
			left: 1,
			right: 1,
			bottom: 1,
		},
		width: 80,
		borderStyle: "double",
	});

	// Transactional deploys only make sense for `docker compose`: `stack deploy`
	// is already declarative and converges on its own, and a fresh-volumes
	// deploy has deliberately destroyed the state we would roll back to.
	const isTransactional = composeType === "docker-compose" && !freshVolumes;

	const backupDir = getComposeBackupDir(compose);
	const composeFilePath = getComposeFilePath(compose);
	const envFilePath = getComposeEnvFilePath(compose);

	// Every path below reaches the shell through shell-quote. `composePath` and
	// `appName` are user-controlled, so interpolating them bare into the script
	// (as `"${path}"`) would be a command-injection vector.
	const qBackupDir = quote([backupDir]);
	const qComposeFile = quote([composeFilePath]);
	const qEnvFile = quote([envFilePath]);
	const qLastGoodCompose = quote([join(backupDir, LAST_GOOD_COMPOSE_BAK)]);
	const qLastGoodEnv = quote([join(backupDir, LAST_GOOD_ENV_BAK)]);

	const restoreCommands = getRestoreCommands(compose, {
		command,
		deploymentId,
		isTransactional,
		exportEnvCommand,
		projectPath: mounts.length > 0 ? projectPath : "",
	});

	// Refresh the known-good snapshot after a successful deploy. Wrapped so it
	// can never turn a successful deploy into a failed one, and so a partial
	// refresh drops the snapshot entirely instead of leaving a compose file
	// paired with a stale `.env`.
	let persistLastGood = "";
	if (isTransactional) {
		let overrideSnapshot = "";
		let overrideCleanup = "";
		if (compose.buildServerId) {
			const qOverrideFile = quote([getComposeBuildOverridePath(compose)]);
			const qLastGoodOverride = quote([
				join(backupDir, LAST_GOOD_OVERRIDE_BAK),
			]);
			overrideSnapshot = ` && { { [ -f ${qOverrideFile} ] && cp ${qOverrideFile} ${qLastGoodOverride}; } || rm -f ${qLastGoodOverride}; }`;
			overrideCleanup = ` ${qLastGoodOverride}`;
		}
		persistLastGood = `
		{ mkdir -p ${qBackupDir} && cp ${qComposeFile} ${qLastGoodCompose} && { { [ -f ${qEnvFile} ] && cp ${qEnvFile} ${qLastGoodEnv}; } || rm -f ${qLastGoodEnv}; }${overrideSnapshot}; } 2>/dev/null || { rm -f ${qLastGoodCompose} ${qLastGoodEnv}${overrideCleanup} 2>/dev/null; echo "Warning: ⚠️ Could not refresh the last-good snapshot"; true; }
		`;
	}

	// Serving side of a build-server deploy: pull exactly the images the
	// build server pushed (already logged in, see prepareComposeBuildServerDeploy),
	// then `up --no-build`. Inside the guarded line below, so a failed pull restores
	// the previous release like a failed `up`.
	let remotePullBlock = "";
	if (remoteBuild && remoteBuild.images.length > 0) {
		// Services that share one image share one reference: pull it once.
		const refs = [...new Set(remoteBuild.images.map((image) => image.image))];
		const pulls = refs.map((ref) => `docker pull ${quote([ref])}`).join(" && ");
		remotePullBlock = `
		PULL_OK=1;
		echo ${quote([`Pulling images on ${remoteBuild.servingHostLabel} (${refs.length} built on the build server)`])};
		if [ "$PULL_OK" = "1" ]; then { ${pulls}; } 2>&1 || PULL_OK=0; fi`;
	}
	const upLine = remotePullBlock
		? `if [ "$PULL_OK" = "1" ]; then env -i PATH="$PATH" HOME="$HOME" ${exportEnvCommand} docker ${command.split(" ").join(" ")} 2>&1; else false; fi`
		: `env -i PATH="$PATH" HOME="$HOME" ${exportEnvCommand} docker ${command.split(" ").join(" ")} 2>&1`;

	// Without a build server this is the single docker line it always was.
	const upSection = remotePullBlock
		? `${remotePullBlock}\n\t\t${upLine}`
		: upLine;

	const bashCommand = `
	set -e
	{
		echo "${logBox}";

		${newCompose}

		${envCommand}

		cd "${projectPath}";

		${
			compose.isolatedDeployment
				? `
			if docker network inspect ${compose.appName} >/dev/null 2>&1; then
				${compose.composeType !== "stack" && compose.isolatedNetworkMtu ? `CURRENT_MTU=$(docker network inspect ${compose.appName} --format '{{index .Options "com.docker.network.driver.mtu"}}'); if [ "$CURRENT_MTU" != "${compose.isolatedNetworkMtu}" ]; then echo "Info: Network ${compose.appName} has MTU $CURRENT_MTU but configured MTU is ${compose.isolatedNetworkMtu}. The network must be recreated for the new MTU to take effect."; fi` : "true"}
			else
				docker network create ${compose.composeType === "stack" ? "--driver overlay" : ""} --attachable ${compose.composeType !== "stack" && compose.isolatedNetworkMtu ? `--opt com.docker.network.driver.mtu=${compose.isolatedNetworkMtu}` : ""} ${compose.appName}
			fi`
				: ""
		}
		${upSection} || { echo "Error: ❌ Docker command failed"; ${restoreCommands} exit 1; }
		${compose.isolatedDeployment ? `docker network connect ${compose.appName} $(docker ps --filter "name=dokploy-traefik" -q) >/dev/null 2>&1` : ""}
		${persistLastGood}

		echo "Docker Compose Deployed: ✅";
	} || {
		echo "Error: ❌ Script execution failed";
		exit 1
	}
	`;

	return bashCommand;
};

// Shell control characters that must never appear in a user-provided compose
// command: they would let it break out of the `docker ${command}` invocation
// into arbitrary host commands. A normal docker compose CLI line never needs them.
// Removed '&' from the blocklist to allow '&&' chaining
const UNSAFE_COMPOSE_COMMAND = /[;|`$(){}<>\n\\]/;

const sanitizeCommand = (command: string) => {
	const sanitizedCommand = command.trim();

	if (UNSAFE_COMPOSE_COMMAND.test(sanitizedCommand)) {
		throw new Error(
			"Invalid characters in compose command: shell control characters are not allowed",
		);
	}

	if (sanitizedCommand.includes("&")) {
		// Block single '&' (e.g., backgrounding tasks) or malformed chains like '&&&'
		if (
			/(?<!&)&(?!&)/.test(sanitizedCommand) ||
			sanitizedCommand.includes("&&&")
		) {
			throw new Error("Single '&' is not allowed. Use '&&' for chaining.");
		}

		// Split by '&&' and check that every chained command (skipping the first one) is safe
		const chains = sanitizedCommand.split("&&").map((cmd) => cmd.trim());
		const isSafeChain = chains
			.slice(1)
			.every(
				(cmd) =>
					cmd.startsWith("docker compose ") ||
					cmd.startsWith("docker-compose "),
			);

		if (!isSafeChain) {
			throw new Error(
				"Chained commands must strictly start with 'docker compose '",
			);
		}
	}

	const parts = sanitizedCommand.split(/\s+/);
	const restCommand = parts.map((arg) => arg.replace(/^"(.*)"$/, "$1"));

	return restCommand.join(" ");
};

/** The `-f` / `-c` argument shared by every command that reads the compose file. */
const getComposeFileArg = (compose: ComposeNested) => {
	const path =
		compose.sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
	return quote([path]);
};

/**
 * `compose -p <app> [--project-directory ..] [--env-file ..] -f <file>`: the
 * invocation prefix every `docker compose` command for this service shares, so
 * the build on a build server resolves the project exactly like the deploy.
 */
export const getComposeBaseArgs = (
	compose: ComposeNested,
	projectPath?: string,
) => {
	const projectDirectoryFlag = projectPath
		? `--project-directory ${quote([projectPath])} `
		: "";
	const envFileFlag = compose.createEnvFile
		? `--env-file ${quote([join(dirname(compose.composePath || "docker-compose.yml"), ".env")])} `
		: "";
	return `compose -p ${quote([compose.appName])} ${projectDirectoryFlag}${envFileFlag}-f ${getComposeFileArg(compose)}`;
};

export interface CreateCommandRemoteOptions {
	/**
	 * Absolute path of the build override to merge on top of the compose file.
	 * Omitted when no service of the compose has a `build:` section.
	 */
	overridePath?: string;
}

export const createCommand = (
	compose: ComposeNested,
	projectPath?: string,
	remote?: CreateCommandRemoteOptions,
) => {
	const { composeType, appName } = compose;
	if (compose.buildServerId) {
		if (compose.command) {
			throw new Error(
				"A custom compose command cannot be combined with a build server.",
			);
		}
		if (!remote) {
			throw new Error(
				"This compose builds on a build server; the serving host never builds.",
			);
		}
	}
	if (compose.command) {
		return `${sanitizeCommand(compose.command)}`;
	}

	let command = "";

	if (composeType === "docker-compose") {
		// When enabled, force-pull the latest images before (re)deploying so a
		// redeploy picks up updated tags instead of reusing the local cache.
		// (`stack deploy` already resolves+pulls, so this only applies here.)
		const pullFlag = compose.pullImagesOnDeploy ? " --pull always" : "";
		// With a build server the images already exist in the registry, so the
		// serving host must never build: `--no-build` turns a missing image into a
		// pull (or an error) instead of a local build.
		const buildFlag = remote ? " --no-build" : " --build";
		const overrideFlag = remote?.overridePath
			? ` -f ${quote([remote.overridePath])}`
			: "";
		command = `${getComposeBaseArgs(compose, projectPath)}${overrideFlag} up -d${pullFlag}${buildFlag} --remove-orphans`;
	} else if (composeType === "stack") {
		// `stack deploy` ignores `build:`; the override swaps in the pushed images.
		const overrideFlag = remote?.overridePath
			? ` -c ${quote([remote.overridePath])}`
			: "";
		command = `stack deploy -c ${getComposeFileArg(compose)}${overrideFlag} ${quote([appName])} --prune --with-registry-auth`;
	}

	return command;
};

export const getCreateEnvFileCommand = (compose: ComposeNested) => {
	const { env, appName } = compose;
	const envFilePath = getComposeEnvFilePath(compose);

	let envContent = `APP_NAME=${appName}\n`;
	envContent += `COMPOSE_PROJECT_NAME=${appName}\n`;
	envContent += env || "";
	if (!envContent.includes("DOCKER_CONFIG")) {
		envContent += "\nDOCKER_CONFIG=/root/.docker";
	}

	if (compose.randomize) {
		envContent += `\nCOMPOSE_PREFIX=${compose.suffix}`;
	}

	const envFileContent = (
		compose.composeType === "stack"
			? prepareEnvironmentVariables(
					envContent,
					compose.environment.project.env,
					compose.environment.env,
				)
			: prepareEnvironmentVariablesForFile(
					envContent,
					compose.environment.project.env,
					compose.environment.env,
				)
	).join("\n");

	const encodedContent = encodeBase64(envFileContent);
	return `
touch ${quote([envFilePath])};
echo "${encodedContent}" | base64 -d > ${quote([envFilePath])};
	`;
};

export const getExportEnvCommand = (compose: ComposeNested) => {
	if (compose.composeType !== "stack") return "";

	const envVars = getEnvironmentVariablesObject(
		compose.env,
		compose.environment.project.env,
		compose.environment.env,
	);
	const exports = Object.entries(envVars)
		.map(([key, value]) => `${key}=${quote([value])}`)
		.join(" ");

	return exports ? `${exports}` : "";
};
