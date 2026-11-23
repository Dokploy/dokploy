import { execFile } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { paths } from "@dokploy/server/constants";
import { quote } from "shell-quote";
import { parse, stringify } from "yaml";
import type { ComposeSpecification } from "../../utils/docker/types";
import { encodeBase64 } from "../../utils/docker/utils";
import { execAsyncRemote } from "../../utils/process/execAsync";
import type { ComposeType } from "./compose-overrides";

const execFileBase = promisify(execFile);

export interface SnapshotCompose {
	appName: string;
	serverId: string | null;
	sourceType: string;
	composePath: string;
	composeType: ComposeType;
	createEnvFile: boolean;
	command: string;
}

export interface ComposeSnapshot {
	spec: ComposeSpecification;
	composeType: ComposeType;
	projectDirectory: string;
	files: { dir: string; compose: string; env: string };
}

interface SnapshotMeta {
	version: 1;
	composeType: ComposeType;
	projectDirectory: string;
}

const SNAPSHOT_DIR = ".dokploy";

/**
 * The snapshot lives next to `code/`, not inside it: previews and
 * "load services" re-clone `code/` from scratch, which deletes the converted
 * compose file and `.env` that the running containers were created from.
 */
export const composeSnapshotFiles = (compose: SnapshotCompose) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const dir = join(COMPOSE_PATH, compose.appName, SNAPSHOT_DIR);
	return {
		dir,
		compose: join(dir, "compose.yml"),
		env: join(dir, "compose.env"),
		meta: join(dir, "meta.json"),
	};
};

const composeFileRelativePath = (compose: SnapshotCompose) =>
	compose.sourceType === "raw" ? "docker-compose.yml" : compose.composePath;

/**
 * Mirrors the project directory that `createCommand` gives Compose, so
 * relative paths in the snapshot resolve to the same place as at deploy.
 */
export const composeProjectDirectory = (
	compose: SnapshotCompose,
	hasMounts: boolean,
) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const codeDir = join(COMPOSE_PATH, compose.appName, "code");
	return hasMounts
		? codeDir
		: join(codeDir, dirname(composeFileRelativePath(compose)));
};

/** The env file Compose interpolated the deployed file with. */
const deployedEnvFile = (compose: SnapshotCompose, hasMounts: boolean) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const codeDir = join(COMPOSE_PATH, compose.appName, "code");
	return compose.createEnvFile
		? join(
				codeDir,
				dirname(compose.composePath || "docker-compose.yml"),
				".env",
			)
		: join(composeProjectDirectory(compose, hasMounts), ".env");
};

/**
 * Shell lines appended to the deploy script after Compose succeeded. Each
 * file is written beside its final name and then moved, so a reader never
 * sees a half-written snapshot.
 */
export const getWriteComposeSnapshotCommand = (
	compose: SnapshotCompose,
	hasMounts: boolean,
) => {
	const files = composeSnapshotFiles(compose);
	if (compose.command) {
		// A custom command may use other files or another project name, so a
		// snapshot of the default file would describe the wrong deployment.
		return `rm -rf ${quote([files.dir])};`;
	}
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const deployedFile = join(
		COMPOSE_PATH,
		compose.appName,
		"code",
		composeFileRelativePath(compose),
	);
	const envFile = deployedEnvFile(compose, hasMounts);
	const meta: SnapshotMeta = {
		version: 1,
		composeType: compose.composeType,
		projectDirectory: composeProjectDirectory(compose, hasMounts),
	};
	const q = (path: string) => quote([path]);
	return `
		mkdir -p ${q(files.dir)};
		cp ${q(deployedFile)} ${q(`${files.compose}.tmp`)};
		if [ -f ${q(envFile)} ]; then cp ${q(envFile)} ${q(`${files.env}.tmp`)}; else : > ${q(`${files.env}.tmp`)}; fi;
		printf '%s' ${quote([JSON.stringify(meta)])} > ${q(`${files.meta}.tmp`)};
		mv -f ${q(`${files.compose}.tmp`)} ${q(files.compose)};
		mv -f ${q(`${files.env}.tmp`)} ${q(files.env)};
		mv -f ${q(`${files.meta}.tmp`)} ${q(files.meta)};
	`;
};

const parseSpec = (yaml: string) =>
	parse(yaml, { maxAliasCount: 10000, merge: true }) as ComposeSpecification;

const isSnapshotMeta = (value: unknown): value is SnapshotMeta =>
	!!value &&
	typeof value === "object" &&
	(value as SnapshotMeta).version === 1 &&
	typeof (value as SnapshotMeta).projectDirectory === "string" &&
	((value as SnapshotMeta).composeType === "docker-compose" ||
		(value as SnapshotMeta).composeType === "stack");

const toSnapshot = (
	compose: SnapshotCompose,
	metaJson: string,
	yaml: string,
): ComposeSnapshot | null => {
	const meta: unknown = JSON.parse(metaJson);
	if (!isSnapshotMeta(meta)) return null;
	const spec = parseSpec(yaml);
	if (!spec || typeof spec !== "object") return null;
	const files = composeSnapshotFiles(compose);
	return {
		spec,
		composeType: meta.composeType,
		projectDirectory: meta.projectDirectory,
		files: { dir: files.dir, compose: files.compose, env: files.env },
	};
};

export const readComposeSnapshot = async (
	compose: SnapshotCompose,
): Promise<ComposeSnapshot | null> => {
	const files = composeSnapshotFiles(compose);
	try {
		if (!compose.serverId) {
			if (!existsSync(files.meta) || !existsSync(files.compose)) return null;
			return toSnapshot(
				compose,
				readFileSync(files.meta, "utf8"),
				readFileSync(files.compose, "utf8"),
			);
		}
		const { stdout } = await execAsyncRemote(
			compose.serverId,
			`if [ -f ${quote([files.meta])} ] && [ -f ${quote([files.compose])} ]; then base64 -w0 ${quote([files.meta])}; echo; base64 -w0 ${quote([files.compose])}; fi`,
		);
		const [meta, yaml] = stdout.trim().split("\n");
		if (!meta || !yaml) return null;
		return toSnapshot(
			compose,
			Buffer.from(meta, "base64").toString("utf8"),
			Buffer.from(yaml, "base64").toString("utf8"),
		);
	} catch (error) {
		console.error(`Unreadable compose snapshot for ${compose.appName}`, error);
		return null;
	}
};

/**
 * Keeps the snapshot's replica count in step with a live scale, so that
 * Stop and Start bring back the scaled count instead of the deployed one.
 */
export const writeSnapshotReplicas = async (
	compose: SnapshotCompose,
	snapshot: ComposeSnapshot,
	serviceName: string,
	replicas: number,
) => {
	const service = snapshot.spec.services?.[serviceName];
	if (!service) return;
	delete service.scale;
	service.deploy = { ...service.deploy, replicas };
	const yaml = stringify(snapshot.spec, { lineWidth: 1000 });
	const target = snapshot.files.compose;
	if (!compose.serverId) {
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(`${target}.tmp`, yaml);
		renameSync(`${target}.tmp`, target);
		return;
	}
	await execAsyncRemote(
		compose.serverId,
		`echo "${encodeBase64(yaml)}" | base64 -d > ${quote([`${target}.tmp`])} && mv -f ${quote([`${target}.tmp`])} ${quote([target])}`,
	);
};

export const composeSnapshotArgs = (
	compose: SnapshotCompose,
	snapshot: ComposeSnapshot,
) => [
	"compose",
	"-p",
	compose.appName,
	"--project-directory",
	snapshot.projectDirectory,
	"-f",
	snapshot.files.compose,
	"--env-file",
	snapshot.files.env,
];

// Compose interpolates the process environment over the env file, so the CLI
// gets the same minimal environment as deploys. Docker connection variables
// pass through (unset in production) so the CLI reaches the daemon Dokploy
// inspects, and Windows needs its system variables for the CLI to start.
const PASSTHROUGH_ENV = [
	"DOCKER_HOST",
	"DOCKER_CONTEXT",
	"DOCKER_CERT_PATH",
	"DOCKER_TLS_VERIFY",
	...(process.platform === "win32"
		? ["SystemRoot", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"]
		: []),
];

const localCliEnv = (): NodeJS.ProcessEnv => {
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? "",
	};
	for (const name of PASSTHROUGH_ENV) {
		const value = process.env[name];
		if (value) env[name] = value;
	}
	// The app augments ProcessEnv with required keys this child must not get.
	return env as NodeJS.ProcessEnv;
};

/** Runs the docker CLI on the compose's host. */
export const runDockerCli = async (
	compose: SnapshotCompose,
	snapshot: ComposeSnapshot,
	args: string[],
) => {
	if (!compose.serverId) {
		return execFileBase("docker", args, {
			cwd: snapshot.files.dir,
			env: localCliEnv(),
			maxBuffer: 10 * 1024 * 1024,
		});
	}
	return execAsyncRemote(
		compose.serverId,
		`cd ${quote([snapshot.files.dir])} && env -i PATH="$PATH" HOME="$HOME" docker ${quote(args)}`,
	);
};
