export interface FailurePattern {
	id: string;
	label: string;
	pattern: RegExp;
}

export const FAILURE_PATTERNS: FailurePattern[] = [
	{
		id: "inotify-limit",
		label: "Inotify limit reached",
		pattern: /max_user_instances|max_user_watches|inotify watch limit reached/i,
	},
	{
		id: "oom",
		label: "Out of memory (OOM)",
		pattern: /\boom[-_ ]?kill(er|ed)?\b|killed process|out of memory/i,
	},
	{
		id: "address-pool-exhausted",
		label: "Docker network address pool exhausted",
		pattern:
			/could not find an available[,]? non-overlapping|available.*address pool/i,
	},
	{
		id: "network-ip-exhausted",
		label: "Network out of IP addresses",
		pattern:
			/could not find an available ip|no available ip addresses|task allocation failure/i,
	},
	{
		id: "network-attach-timeout",
		label: "Network attach timed out",
		pattern:
			/attaching to network failed|failed to set up container networking/i,
	},
	{
		id: "disk-full",
		label: "Disk space exhausted",
		pattern: /no space left on device/i,
	},
	{
		id: "conntrack-full",
		label: "Connection tracking table full",
		pattern: /nf_conntrack:?\s*table full/i,
	},
	{
		id: "fd-limit",
		label: "File descriptor limit reached",
		pattern: /too many open files/i,
	},
	{
		id: "pid-limit",
		label: "Process/PID limit reached",
		pattern:
			/pids\.max|cannot allocate memory|fork:.*resource temporarily unavailable/i,
	},
];

export const classifyFailure = (
	text: string | null | undefined,
): { id: string; label: string } | null => {
	if (!text) return null;
	for (const entry of FAILURE_PATTERNS) {
		if (entry.pattern.test(text)) {
			return { id: entry.id, label: entry.label };
		}
	}
	return null;
};
