import { quote } from "shell-quote";
import { paths } from "../../constants";
import { getGitTokenAuthConfig } from "../providers/git";

export const ACT_VERSION = "0.2.89";

export const DEFAULT_PLATFORM_IMAGES: Record<string, string> = {
	"ubuntu-latest": "catthehacker/ubuntu:act-latest",
	"ubuntu-24.04": "catthehacker/ubuntu:act-24.04",
	"ubuntu-22.04": "catthehacker/ubuntu:act-22.04",
};

export const workflowRunDirectory = (workflowRunId: string) =>
	`${paths(true).BASE_PATH}/workflows/${workflowRunId}`;

export const workflowRunLogPath = (workflowRunId: string) =>
	`${paths(true).LOGS_PATH}/workflows/${workflowRunId}.log`;

const toBase64 = (value: string) => Buffer.from(value).toString("base64");

// act reads these files with godotenv, which expands `$VAR` inside double
// quotes, so `$` has to be escaped along with quotes, backslashes and newlines.
export const toDotenv = (values: Record<string, string>) =>
	Object.entries(values)
		.map(([key, value]) => {
			const escaped = value
				.replace(/\\/g, "\\\\")
				.replace(/"/g, '\\"')
				.replace(/\$/g, "\\$")
				.replace(/\r?\n/g, "\\n");
			return `${key}="${escaped}"`;
		})
		.join("\n");

const writeFile = (path: string, content: string, mode = "600") =>
	`printf '%s' ${quote([toBase64(content)])} | base64 -d > ${quote([path])} && chmod ${mode} ${quote([path])}`;

export type ActRunInput = {
	workflowRunId: string;
	event: "push" | "pull_request" | "workflow_dispatch";
	workflowPath: string;
	eventPayload: Record<string, unknown>;
	secrets: Record<string, string>;
	variables: Record<string, string>;
	inputs?: Record<string, string> | null;
	targetJob?: string | null;
	cloneUrl: string;
	token: string;
	sha: string;
	ref: string;
	branch?: string | null;
	actor: string;
	defaultBranch: string;
	githubInstance?: string;
};

export const buildActArgs = (input: ActRunInput, runDir: string) => {
	const args = [
		"act",
		input.event,
		"-W",
		input.workflowPath,
		"--eventpath",
		`${runDir}/event.json`,
		"--secret-file",
		`${runDir}/secrets.env`,
		"--var-file",
		`${runDir}/vars.env`,
		"--input-file",
		`${runDir}/inputs.env`,
		"--actor",
		input.actor,
		"--defaultbranch",
		input.defaultBranch,
		"--artifact-server-path",
		`${runDir}/artifacts`,
		"--rm",
	];
	if (input.targetJob) {
		args.push("-j", input.targetJob);
	}
	if (input.githubInstance) {
		args.push("--github-instance", input.githubInstance);
	}
	for (const [label, image] of Object.entries(DEFAULT_PLATFORM_IMAGES)) {
		args.push("-P", `${label}=${image}`);
	}
	return args;
};

const buildJobScript = (input: ActRunInput, runDir: string) => {
	const repoDir = `${runDir}/repo`;
	const checkout = input.branch
		? `git checkout -q -B ${quote([input.branch])} FETCH_HEAD`
		: "git checkout -q --detach FETCH_HEAD";

	return [
		"#!/usr/bin/env bash",
		`cd ${quote([runDir])}`,
		`finish() { code=$?; rm -f ${quote([`${runDir}/secrets.env`])}; echo "$code" > ${quote([`${runDir}/exit_code.tmp`])} && mv ${quote([`${runDir}/exit_code.tmp`])} ${quote([`${runDir}/exit_code`])}; }`,
		"trap finish EXIT",
		"set -eo pipefail",
		`echo ${quote([`Checking out ${input.sha.slice(0, 7)} (${input.ref})`])}`,
		`git init -q ${quote([repoDir])}`,
		`cd ${quote([repoDir])}`,
		`git remote add origin ${quote([input.cloneUrl])}`,
		`git ${getGitTokenAuthConfig(input.cloneUrl, input.token)} fetch -q --depth 1 origin ${quote([input.sha])}`,
		checkout,
		"set +e",
		quote(buildActArgs(input, runDir)),
		"exit $?",
	].join("\n");
};

/**
 * Prepares the run directory on the workflow server and starts act in its own
 * process group, detached from the SSH session, so a panel restart or a dropped
 * connection does not kill the run. Progress is read from the log file and the
 * `exit_code` file written when the job script exits.
 */
export const buildActStartScript = (input: ActRunInput) => {
	const runDir = workflowRunDirectory(input.workflowRunId);
	const logPath = workflowRunLogPath(input.workflowRunId);
	const logDir = logPath.slice(0, logPath.lastIndexOf("/"));

	const secrets = { ...input.secrets, GITHUB_TOKEN: input.token };

	return [
		"set -e",
		`rm -rf ${quote([runDir])}`,
		`mkdir -p ${quote([runDir])} ${quote([logDir])}`,
		`chmod 700 ${quote([runDir])}`,
		writeFile(`${runDir}/event.json`, JSON.stringify(input.eventPayload)),
		writeFile(`${runDir}/secrets.env`, toDotenv(secrets)),
		writeFile(`${runDir}/vars.env`, toDotenv(input.variables)),
		writeFile(`${runDir}/inputs.env`, toDotenv(input.inputs ?? {})),
		writeFile(`${runDir}/run.sh`, buildJobScript(input, runDir), "700"),
		`: > ${quote([logPath])}`,
		`nohup setsid bash ${quote([`${runDir}/run.sh`])} >> ${quote([logPath])} 2>&1 < /dev/null &`,
		`echo $! > ${quote([`${runDir}/pid`])}`,
	].join("\n");
};

/**
 * Prints one `<runId> <state>` line per run, where state is the exit code once
 * the job script finished, `running` while its process group is alive, or
 * `lost` when neither is true (the server rebooted or the files were removed).
 */
export const buildActStatusScript = (workflowRunIds: string[]) =>
	workflowRunIds
		.map((id) => {
			const runDir = workflowRunDirectory(id);
			const exitFile = quote([`${runDir}/exit_code`]);
			const pidFile = quote([`${runDir}/pid`]);
			const label = quote([id]);
			return `if [ -f ${exitFile} ]; then echo ${label} "$(cat ${exitFile})"; elif [ -f ${pidFile} ] && kill -0 "$(cat ${pidFile})" 2>/dev/null; then echo ${label} running; else echo ${label} lost; fi`;
		})
		.join("\n");

export const buildActCancelScript = (workflowRunId: string) => {
	const pidFile = quote([`${workflowRunDirectory(workflowRunId)}/pid`]);
	return [
		`if [ -f ${pidFile} ]; then`,
		`  PID=$(cat ${pidFile})`,
		`  kill -INT -- "-$PID" 2>/dev/null || true`,
		'  for i in $(seq 1 15); do kill -0 "$PID" 2>/dev/null || exit 0; sleep 1; done',
		`  kill -KILL -- "-$PID" 2>/dev/null || true`,
		"fi",
	].join("\n");
};

export const buildActCleanupScript = (workflowRunId: string) =>
	`rm -rf ${quote([workflowRunDirectory(workflowRunId)])}`;

export const installActScript = () => `
	if command_exists act && act --version 2>/dev/null | grep -q "${ACT_VERSION}"; then
		echo "act ${ACT_VERSION} already installed ✅"
	else
		case "$SYS_ARCH" in
			x86_64|amd64) ACT_ARCH="x86_64" ;;
			aarch64|arm64) ACT_ARCH="arm64" ;;
			armv7l) ACT_ARCH="armv7" ;;
			*) echo "Unsupported architecture for act: $SYS_ARCH ❌"; exit 1 ;;
		esac
		ACT_TMP=$(mktemp -d)
		curl -fsSL "https://github.com/nektos/act/releases/download/v${ACT_VERSION}/act_Linux_$ACT_ARCH.tar.gz" | tar -xz -C "$ACT_TMP" act
		$SUDO_CMD install -m 755 "$ACT_TMP/act" /usr/local/bin/act
		rm -rf "$ACT_TMP"
		echo "act ${ACT_VERSION} installed ✅"
	fi
	mkdir -p "$HOME/.config/act"
	ACTRC=""
${Object.entries(DEFAULT_PLATFORM_IMAGES)
	.map(([label, image]) => `	ACTRC="$ACTRC-P ${label}=${image}\n"`)
	.join("\n")}
	printf "$ACTRC" > "$HOME/.config/act/actrc"
	cp "$HOME/.config/act/actrc" "$HOME/.actrc"
	echo "act platform images configured ✅"
`;
