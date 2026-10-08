import { dirname } from "node:path";
import { quote } from "shell-quote";
import { stringify } from "yaml";
import {
	type ComposeNested,
	getComposeBaseArgs,
	getExportEnvCommand,
	type RemoteBuildImage,
} from "./compose";

/**
 * Pure command builders for building a compose service's images on a build
 * server. Nothing here touches the network or the database, so the exact shell
 * the build server and the serving host run is unit-testable. The orchestration
 * (which host runs which command, log streaming, failure handling) lives in
 * `services/compose-build-server.ts`.
 */

/**
 * Rules for a compose's build-server settings, as a message (or `null` when
 * valid) so the same check can back the API, the UI and the deploy path:
 *
 * - server and registry are set together or not at all (images built on the
 *   build server have nowhere to go without a registry);
 * - the server must exist and have `serverType = 'build'`;
 * - the registry must exist;
 * - a custom `command` cannot be combined with a build server, because the
 *   command replaces the whole `up` invocation the build flow depends on.
 */
export const getComposeBuildSettingsError = ({
	buildServerId,
	buildRegistryId,
	command,
	server,
	registry,
}: {
	buildServerId?: string | null;
	buildRegistryId?: string | null;
	command?: string | null;
	server?: { serverType: string } | null;
	registry?: unknown | null;
}): string | null => {
	if (!buildServerId && !buildRegistryId) return null;
	if (!buildServerId || !buildRegistryId) {
		return "Build Server and Build Registry must be set together: pick both, or set both to None.";
	}
	if (!server) return "The selected build server was not found.";
	if (server.serverType !== "build") {
		return 'The selected server is not a build server (its type must be "build").';
	}
	if (!registry) return "The selected build registry was not found.";
	if (command?.trim()) {
		return "A custom compose command cannot be combined with a build server. Clear the custom command first.";
	}
	return null;
};

/** A compose service that has a `build:` section. */
export interface ComposeBuiltService {
	service: string;
	/** Name compose gives the image it builds (and tags) on the build server. */
	localImage: string;
}

/** A built service together with the registry references it is pushed as. */
export interface ComposePushedImage extends ComposeBuiltService {
	/** Unique-per-deployment reference the serving host pulls and runs. */
	ref: string;
	/** Moving `:latest` reference, pushed as a convenience (never deployed). */
	latestRef: string;
}

/**
 * Docker repository path components are lowercase `[a-z0-9]` runs joined by
 * single separators. Service names may contain upper case letters and runs of
 * separators, so normalize instead of failing the push.
 */
export const sanitizeImageRepoName = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/[._-]{2,}/g, "-")
		.replace(/^[._-]+|[._-]+$/g, "");

/** `<appName>-<service>`: matches the name compose v2 gives a built image. */
export const getBuiltImageRepoName = (appName: string, service: string) =>
	sanitizeImageRepoName(`${appName}-${service}`);

/**
 * Registry tag for one deployment. Docker tags cannot start with `.` or `-`
 * and deployment ids (nanoid) can, so the id gets a fixed prefix.
 */
export const getBuiltImageTag = (deploymentId: string) =>
	`dpl-${deploymentId}`.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 128);

/**
 * Reads `docker compose config --format json` and returns the services that
 * have a `build:` section together with the image name compose assigns to
 * them: the explicit `image:` when there is one (services with both `image:`
 * and `build:` are built *and* tagged with that name), otherwise the
 * `<project>-<service>` default.
 */
export const parseBuiltServices = (
	configJson: string,
	projectName: string,
): ComposeBuiltService[] => {
	// Compose can print notices ahead of the document; start at the first brace.
	const start = configJson.indexOf("{");
	if (start === -1) {
		throw new Error(
			"Could not read the compose configuration on the build server (no JSON output).",
		);
	}
	let parsed: {
		name?: string;
		services?: Record<string, { build?: unknown; image?: unknown } | null>;
	};
	try {
		parsed = JSON.parse(configJson.slice(start));
	} catch {
		throw new Error(
			"Could not parse the compose configuration printed by the build server.",
		);
	}

	const project = parsed.name || projectName;
	const built: ComposeBuiltService[] = [];
	for (const [service, definition] of Object.entries(parsed.services ?? {})) {
		if (!definition || !definition.build) continue;
		const image =
			typeof definition.image === "string" && definition.image.trim()
				? definition.image.trim()
				: `${project}-${service}`;
		built.push({ service, localImage: image });
	}
	return built;
};

/**
 * Compose override that pins every built service to the image that was pushed
 * for it. The base file keeps its `build:` section, so the serving host runs
 * `up --no-build`; this file only decides which image the service starts.
 *
 * `pull_policy` is only valid for `docker compose`: the swarm `stack deploy`
 * loader has its own, stricter schema, so a stack override carries `image:`
 * alone.
 */
export const buildComposeOverrideYaml = (
	images: RemoteBuildImage[],
	composeType: "docker-compose" | "stack",
) => {
	const services: Record<string, Record<string, string>> = {};
	for (const { service, image } of images) {
		services[service] =
			composeType === "stack"
				? { image }
				: // `missing`: the reference is unique per deployment, so it is pulled
					// the first time and reused (e.g. by a rollback) afterwards. It also
					// overrides a `never` / `build` policy set in the base file.
					{ image, pull_policy: "missing" };
	}
	return stringify({ services }, { lineWidth: 1000 });
};

/** Shell that writes `content` to `path` (base64, so no quoting hazards). */
export const getWriteFileCommand = (path: string, content: string) =>
	`mkdir -p ${quote([dirname(path)])} && echo "${Buffer.from(content, "utf8").toString("base64")}" | base64 -d > ${quote([path])};`;

const getComposeRunPrefix = (compose: ComposeNested) =>
	`env -i PATH="$PATH" HOME="$HOME" ${getExportEnvCommand(compose)}`;

/**
 * Runs on the build server: prints the resolved compose configuration. The
 * output goes back to Dokploy for parsing and is deliberately never written to
 * the deployment log (it contains the resolved environment).
 */
export const getComposeConfigJsonCommand = (
	compose: ComposeNested,
	codePath: string,
	projectPath?: string,
) =>
	`cd ${quote([codePath])} && ${getComposeRunPrefix(compose)} docker ${getComposeBaseArgs(compose, projectPath)} config --format json`;

/** Runs on the build server: `docker compose ... build` for every service. */
export const getComposeBuildCommand = (
	compose: ComposeNested,
	codePath: string,
	projectPath?: string,
) =>
	`set -e; cd ${quote([codePath])}; echo "🔨 Building images with docker compose build"; ${getComposeRunPrefix(compose)} docker ${getComposeBaseArgs(compose, projectPath)} build 2>&1;`;

/**
 * Runs on the build server after a successful build: logs in, tags the image
 * compose produced for each built service, pushes the per-deployment tag and
 * `:latest`, then drops dangling images older than a day. Volumes are never
 * pruned, and neither are images that are still referenced.
 */
export const getTagAndPushCommand = ({
	images,
	loginCommand,
	registryLabel,
}: {
	images: ComposePushedImage[];
	loginCommand: string;
	registryLabel: string;
}) => {
	const lines: string[] = [
		"set -e;",
		`echo ${quote([`🔑 Logging in to registry ${registryLabel}`])};`,
		`${loginCommand} || { echo "❌ Registry Login Failed"; exit 1; }`,
		'echo "✅ Registry Login Success";',
	];
	for (const image of images) {
		const local = quote([image.localImage]);
		const ref = quote([image.ref]);
		const latest = quote([image.latestRef]);
		lines.push(
			`echo ${quote([`📦 ${image.service}: ${image.localImage} -> ${image.ref}`])};`,
			`docker image inspect ${local} >/dev/null 2>&1 || { echo ${quote([`❌ The build did not produce image ${image.localImage} for service ${image.service}`])}; exit 1; }`,
			`docker tag ${local} ${ref} || { echo "❌ Error tagging image"; exit 1; }`,
			`docker tag ${local} ${latest} || { echo "❌ Error tagging image"; exit 1; }`,
			`docker push ${ref} || { echo "❌ Error pushing image"; exit 1; }`,
			`docker push ${latest} || { echo "❌ Error pushing image"; exit 1; }`,
			`echo ${quote([`✅ ${image.service} pushed`])};`,
		);
	}
	lines.push(
		'docker image prune -f --filter "until=24h" >/dev/null 2>&1 || true;',
	);
	return lines.join("\n");
};

export const REUSABLE_CLONE_ANSWER = "dokploy-reusable-clone";
const CLONE_COMPLETE_FILE = ".git/dokploy-clone-ok";

/**
 * Written as the very last step of a build-server clone (after the clone and
 * any patches), so a clone that was killed part-way (a cancel can SIGKILL it
 * after the ref is written but before checkout finishes) is never mistaken for
 * a finished one. Checkouts made before this marker existed have none and are
 * cloned once more on their next rebuild.
 */
export const getCloneCompleteCommand = (codePath: string) =>
	`touch ${quote([`${codePath}/${CLONE_COMPLETE_FILE}`])};`;

/**
 * Prints `dokploy-reusable-clone` when `codePath` is a finished checkout of its
 * own: the completion marker exists, HEAD resolves, and the repository's git
 * dir is the relative `.git`, which git only prints when `codePath` is the top
 * level (a plain `git -C` would walk up into any ancestor repository, such as
 * etckeeper, for an empty directory, and print an absolute path).
 */
export const getReusableCloneProbeCommand = (codePath: string) => {
	const dir = quote([codePath]);
	const marker = quote([`${codePath}/${CLONE_COMPLETE_FILE}`]);
	return `if [ -f ${marker} ] && [ "$(git -C ${dir} rev-parse --git-dir 2>/dev/null)" = .git ] && git -C ${dir} rev-parse --verify -q HEAD >/dev/null 2>&1; then echo ${REUSABLE_CLONE_ANSWER}; fi`;
};
