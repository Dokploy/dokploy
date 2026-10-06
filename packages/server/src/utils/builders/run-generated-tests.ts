import fs from "node:fs/promises";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type {
	QcExecResult,
	QcManifest,
} from "@dokploy/server/services/qc-service-client";
import { quote } from "shell-quote";
import {
	execAsync,
	execAsyncRemote,
	writeFileRemote,
} from "../process/execAsync";

export const DEFAULT_RUNNER_IMAGES: Record<string, string> = {
	node: "node:22",
	python: "python:3.12",
	go: "golang:1.23",
};

const WORK_PREFIX = "/tmp/qc-exec-";
const MAX_RESULT_BYTES = 900_000;
const MAX_LOG_BYTES = 200_000;

export const getRunnerImage = (
	manifest: Pick<QcManifest, "language">,
	override?: string | null,
) => {
	const image = override?.trim() || DEFAULT_RUNNER_IMAGES[manifest.language];
	if (!image) {
		throw new Error(`No test runner image for language "${manifest.language}"`);
	}
	return image;
};

const safeId = (deploymentId: string) =>
	deploymentId.replace(/[^A-Za-z0-9_-]/g, "_");

export const getWorkDir = (deploymentId: string) =>
	`${WORK_PREFIX}${safeId(deploymentId)}`;

export const getContainerName = (deploymentId: string) =>
	`qc-exec-${safeId(deploymentId)}`;

export const getCodePath = (appName: string, serverId?: string | null) =>
	join(paths(!!serverId).APPLICATIONS_PATH, appName, "code");

// Runs on the build server. The generated tests are code a model wrote, so
// they get a throw-away copy of the source in a container of their own: no
// environment of the application, no Docker socket, no capabilities, and
// bounded memory, CPU, processes and time. It always exits 0 and leaves the
// test command's exit code in `$W/exit` so the caller can report it.
export const buildTestRunScript = (params: {
	workDir: string;
	codePath: string;
	image: string;
	manifest: QcManifest;
	deploymentId: string;
	// The bundle arrives base64-encoded when it was written over SFTP.
	decodeBundle: boolean;
}) => {
	const { workDir, codePath, image, manifest, deploymentId } = params;
	if (!workDir.startsWith(WORK_PREFIX)) {
		throw new Error("Refusing to use a work directory outside /tmp/qc-exec-");
	}
	const name = getContainerName(deploymentId);
	const network =
		manifest.installNeedsNetwork || manifest.needsNetwork ? "bridge" : "none";
	const inner = `${manifest.install} && ${manifest.command}`;
	const timeout = manifest.timeoutSec;
	const containerCwd = `/app/${manifest.cwd === "." ? "" : manifest.cwd}`;

	return [
		"set -e",
		`W=${quote([workDir])}`,
		'rm -rf "$W/app" "$W/out"',
		'mkdir -p "$W/out"',
		params.decodeBundle ? 'base64 -d "$W/tests.b64" > "$W/tests.tar.gz"' : "",
		// The service already validates paths; this is the second lock.
		`if tar -tzf "$W/tests.tar.gz" | grep -Eq '(^/|(^|/)\\.\\.(/|$))'; then echo "Unsafe path in the test bundle"; exit 1; fi`,
		`cp -a ${quote([codePath])} "$W/app"`,
		'tar -xzf "$W/tests.tar.gz" -C "$W/app" --no-same-owner',
		`docker pull -q ${quote([image])} >/dev/null 2>&1 || true`,
		"set +e",
		[
			`timeout -k 10 ${Number(timeout)} docker run --rm --name ${quote([name])}`,
			'--user "$(id -u):$(id -g)"',
			"--cap-drop ALL --security-opt no-new-privileges",
			"--memory 2g --cpus 2 --pids-limit 512",
			`--network ${network}`,
			"-e HOME=/tmp -e CI=true -e npm_config_cache=/tmp/.npm",
			"-e PIP_USER=1 -e PYTHONUSERBASE=/tmp/.pyuser -e PIP_DISABLE_PIP_VERSION_CHECK=1",
			"-e GOCACHE=/tmp/.gocache -e GOPATH=/tmp/.gopath -e GOFLAGS=-buildvcs=false",
			'-v "$W/app:/app" -v "$W/out:/out"',
			`-w ${quote([containerCwd])}`,
			quote([image]),
			`sh -c ${quote([inner])}`,
			'> "$W/out/run.log" 2>&1',
		].join(" "),
		'echo $? > "$W/exit"',
		`docker rm -f ${quote([name])} >/dev/null 2>&1 || true`,
		`tail -c ${MAX_LOG_BYTES} "$W/out/run.log"`,
		"exit 0",
	]
		.filter(Boolean)
		.join("\n");
};

const resultsFile = (format: QcManifest["resultsFormat"]) => {
	switch (format) {
		case "junit-xml":
			return "results.xml";
		case "text":
			return "run.log";
		default:
			return "results.json";
	}
};

const run = async (serverId: string | null | undefined, command: string) =>
	serverId ? execAsyncRemote(serverId, command) : execAsync(command);

const readFile = async (
	serverId: string | null | undefined,
	path: string,
	maxBytes: number,
) => {
	const { stdout } = await run(
		serverId,
		`head -c ${maxBytes} ${quote([path])} 2>/dev/null || true`,
	);
	return stdout;
};

const JSON_FORMATS = new Set(["vitest-json", "jest-json", "mocha-json"]);

export const runGeneratedTests = async (params: {
	deploymentId: string;
	serverId?: string | null;
	appName: string;
	bundle: Buffer;
	manifest: QcManifest;
	runnerImage?: string | null;
}): Promise<QcExecResult> => {
	const { deploymentId, serverId, manifest } = params;
	const workDir = getWorkDir(deploymentId);
	const image = getRunnerImage(manifest, params.runnerImage);
	const script = buildTestRunScript({
		workDir,
		codePath: getCodePath(params.appName, serverId),
		image,
		manifest,
		deploymentId,
		decodeBundle: !!serverId,
	});

	try {
		await run(serverId, `mkdir -p ${quote([workDir])}`);
		if (serverId) {
			await writeFileRemote(
				serverId,
				`${workDir}/tests.b64`,
				params.bundle.toString("base64"),
			);
		} else {
			await fs.writeFile(join(workDir, "tests.tar.gz"), params.bundle);
		}

		const startedAt = Date.now();
		await run(serverId, script);
		const durationSec = (Date.now() - startedAt) / 1000;

		const exitText = await readFile(serverId, `${workDir}/exit`, 20);
		const exitCode = Number.parseInt(exitText.trim(), 10);
		const logTail = await readFile(
			serverId,
			`${workDir}/out/run.log`,
			MAX_LOG_BYTES,
		);
		const raw = await readFile(
			serverId,
			`${workDir}/out/${resultsFile(manifest.resultsFormat)}`,
			MAX_RESULT_BYTES,
		);

		const result: QcExecResult = {
			exitCode: Number.isNaN(exitCode) ? -1 : exitCode,
			durationSec,
			logTail,
		};
		if (raw.trim()) {
			if (JSON_FORMATS.has(manifest.resultsFormat)) {
				try {
					result.resultsJson = JSON.parse(raw);
				} catch {
					result.resultsText = raw;
				}
			} else {
				result.resultsText = raw;
			}
		}
		return result;
	} finally {
		await run(serverId, `rm -rf ${quote([workDir])}`).catch(() => {});
	}
};
