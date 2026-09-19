const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** OpenSSH gives each non-PTY command its own process group, including its children. */
export const withRemoteDeadline = (
	command: string,
	timeout: number,
): string => {
	const seconds = timeout / 1000;
	// The status pipe is private; output relays keep the deadline alive until inherited pipes drain.
	return `exec sh -c ${quote(`
kill -0 -$$ 2>/dev/null || { echo 'Timed SSH command requires an isolated process group' >&2; exit 125; }
command -v cat >/dev/null 2>&1 || { echo 'Timed SSH command requires cat' >&2; exit 125; }
if sleep 0.001 2>/dev/null; then
 duration=${seconds}
elif sleep 0 2>/dev/null; then
 duration=${Math.ceil(seconds)}
else
 echo 'Timed SSH command requires sleep' >&2
 exit 125
fi
sleep "$duration" &
deadline=$!
(
 result=$(
  exec 3>&1
  {
   { sh -c ${quote(command)} 3>&- 4>&- 5>&-; printf '%s' "$?" >&3; } | cat >&4
  } 2>&1 | cat >&5
 )
 kill "$deadline" 2>/dev/null
 exit "$result"
) 4>&1 5>&2 &
command_pid=$!
if wait "$deadline" 2>/dev/null; then
 kill -s KILL 0
fi
wait "$command_pid"
`)}`;
};
