import { paths } from "@dokploy/server/constants";

/**
 * Pure command builders that let a build running on a build server be
 * cancelled precisely.
 *
 * A build-server deploy runs its build as one (application) or a few (compose)
 * `execAsyncRemote` commands. Cancelling must stop THAT deployment's build and
 * nothing else on the build server, which runs up to three builds at once and
 * doubles as a CI runner. So instead of a pattern kill (`pkill -f ...`):
 *
 * - the build command is launched through `wrapCancelableRemoteBuild`, which
 *   starts it in its own session (`setsid`, so the process group id is the
 *   session leader's pid) and records `<pgid> <start time> <deploymentId>` in a
 *   per-deployment pid file;
 * - `getKillRemoteBuildCommand` reads that file, checks that the recorded
 *   process is still the one that wrote it, and signals only that group.
 *
 * Nothing here ever prints or logs a process's arguments: the build command
 * carries repository tokens, a base64 `.env` and registry credentials. The
 * kill script only prints one of a fixed set of status words.
 */

/** Everything the wrapper and the kill command agree on. */
export interface RemoteBuildCancelTarget {
	/** Per-deployment pid file on the build server. */
	pidFile: string;
	deploymentId: string;
}

/**
 * Wraps `value` in single quotes so a shell reads it back verbatim: ids, paths
 * and the build command itself can contain any character.
 */
export const shSingleQuote = (value: string) =>
	`'${value.replace(/'/g, `'\\''`)}'`;

/** Deployment ids are nanoids; anything else must not escape the file name. */
const safeFileSegment = (value: string) =>
	value.replace(/[^A-Za-z0-9_-]/g, "_") || "_";

/**
 * Where the pid file of one deployment's build lives on the build server: a
 * hidden directory under the deployments' log directory, one file per
 * deployment id.
 */
export const getRemoteBuildPidFile = (deploymentId: string) =>
	`${paths(true).LOGS_PATH}/.build-pids/${safeFileSegment(deploymentId)}.pid`;

export const getRemoteBuildCancelTarget = (
	deploymentId: string,
): RemoteBuildCancelTarget => ({
	pidFile: getRemoteBuildPidFile(deploymentId),
	deploymentId,
});

/**
 * Inner script, run by `setsid sh -c`. `$$` is the new session leader (and so
 * the group id); its field 22 in /proc/<pid>/stat is its start time, which is
 * what later proves that a pid is still the process that wrote the file and
 * not an unrelated one that reused the number.
 * Arguments: $1 pid file, $2 deployment id, $3 the build command.
 */
const SESSION_LAUNCHER = [
	's=$(sed "s/^.*) //" /proc/$$/stat 2>/dev/null | cut -d" " -f20)',
	"b=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null)",
	// The umask is scoped to the pid-file write: the build itself must keep the
	// session's normal umask, or clones and COPY'd files end up root-only.
	'( umask 077; printf "%s %s %s %s\\n" "$$" "$s" "$2" "$b" > "$1.$$" ) 2>/dev/null && mv -f "$1.$$" "$1" 2>/dev/null',
	'exec "${SHELL:-sh}" -c "$3"',
].join("; ");

/**
 * Wraps a build command so it runs in its own session with a pid file, then
 * removes the pid file when the command ends, passing its exit status on.
 *
 * - The subshell makes `setsid` exec in place: it only forks (and then returns
 *   at once) when the caller is a process group leader, which the first
 *   process of an ssh session is.
 * - The command still runs in the login shell (`$SHELL -c`), exactly as when
 *   it is sent over ssh unwrapped.
 * - Without `setsid` the command runs as before, uncancellable, and says so.
 * - If the pid file cannot be written the command still runs.
 */
export const wrapCancelableRemoteBuild = (
	command: string,
	{ pidFile, deploymentId }: RemoteBuildCancelTarget,
) =>
	[
		`__f=${shSingleQuote(pidFile)}`,
		`__id=${shSingleQuote(deploymentId)}`,
		`__cmd=${shSingleQuote(command)}`,
		'mkdir -p "$(dirname "$__f")" 2>/dev/null',
		'if command -v setsid >/dev/null 2>&1; then',
		`( exec setsid sh -c ${shSingleQuote(SESSION_LAUNCHER)} sh "$__f" "$__id" "$__cmd" )`,
		"else",
		'echo "setsid is not installed on this server: this build cannot be cancelled from Dokploy." >&2',
		'( exec "${SHELL:-sh}" -c "$__cmd" )',
		"fi",
		"__rc=$?",
		'rm -f "$__f"',
		'exit "$__rc"',
	].join("\n");

/** What the kill command reports, one word on stdout. */
export type RemoteBuildKillResult =
	/** The group was signalled and is gone. */
	| "KILLED"
	/** No pid file: no wrapped build is running (or it has not started yet). */
	| "NONE"
	/** A pid file that does not belong to this deployment or is unreadable. */
	| "STALE"
	/** The recorded process is gone or is not the one that wrote the file. */
	| "GONE"
	/** The group survived SIGKILL. */
	| "FAILED"
	/** No /proc, so the process cannot be told apart from a reused pid. */
	| "UNVERIFIED";

export const KILL_GRACE_SECONDS = 8;

/**
 * Runs on the build server: sends SIGTERM to the deployment's process group,
 * waits up to `graceSeconds` for it to go, then SIGKILLs what is left. The
 * docker/buildx client handles SIGTERM by cancelling its BuildKit solve, so the
 * grace lets the daemon side stop cleanly before the hard kill.
 *
 * It refuses to signal anything unless the pid file names this deployment and
 * the process with the recorded pid still has the recorded start time.
 */
export const getKillRemoteBuildCommand = (
	{ pidFile, deploymentId }: RemoteBuildCancelTarget,
	graceSeconds = KILL_GRACE_SECONDS,
) => {
	const grace = Math.max(1, Math.floor(graceSeconds));
	return [
		`f=${shSingleQuote(pidFile)}`,
		`id=${shSingleQuote(deploymentId)}`,
		'[ -f "$f" ] || { echo NONE; exit 0; }',
		'read -r pgid start owner boot < "$f" || { echo STALE; exit 0; }',
		'[ "$owner" = "$id" ] || { echo STALE; exit 0; }',
		'case "$pgid" in ""|*[!0-9]*|0|1) echo STALE; exit 0;; esac',
		'[ "$pgid" != "$$" ] || { echo STALE; exit 0; }',
		'[ -r "/proc/$pgid/stat" ] || { [ -d /proc/self ] && { rm -f "$f"; echo GONE; exit 0; }; echo UNVERIFIED; exit 0; }',
		// A pid file left over from before a reboot names a pid that now belongs to
		// something else; the boot id tells the two boots apart.
		'curboot=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null)',
		'[ "$boot" = "$curboot" ] || { rm -f "$f"; echo GONE; exit 0; }',
		'cur=$(sed "s/^.*) //" "/proc/$pgid/stat" 2>/dev/null | cut -d" " -f20)',
		'[ -n "$start" ] && [ "$cur" = "$start" ] || { rm -f "$f"; echo GONE; exit 0; }',
		'kill -s TERM -- "-$pgid" 2>/dev/null',
		"i=0",
		`while [ "$i" -lt ${grace} ]; do`,
		'kill -s 0 -- "-$pgid" 2>/dev/null || { rm -f "$f"; echo KILLED; exit 0; }',
		"sleep 1; i=$((i+1))",
		"done",
		'kill -s KILL -- "-$pgid" 2>/dev/null',
		"sleep 1",
		'kill -s 0 -- "-$pgid" 2>/dev/null && { echo FAILED; exit 0; }',
		'rm -f "$f"; echo KILLED',
	].join("\n");
};

const KILL_RESULTS: readonly RemoteBuildKillResult[] = [
	"KILLED",
	"NONE",
	"STALE",
	"GONE",
	"FAILED",
	"UNVERIFIED",
];

/** Reads the status word the kill command printed (the last line wins). */
export const parseKillResult = (stdout: string): RemoteBuildKillResult => {
	const lines = stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const last = lines[lines.length - 1];
	return KILL_RESULTS.find((result) => result === last) ?? "FAILED";
};
