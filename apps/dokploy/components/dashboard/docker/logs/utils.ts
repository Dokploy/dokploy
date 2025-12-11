export type LogType = "error" | "warning" | "success" | "info" | "debug";
export type LogVariant = "red" | "yellow" | "green" | "blue" | "orange";

export interface LogLine {
	rawTimestamp: string | null;
	timestamp: Date | null;
	message: string;
}

interface LogStyle {
	type: LogType;
	variant: LogVariant;
	color: string;
}

const LOG_STYLES: Record<LogType, LogStyle> = {
	error: {
		type: "error",
		variant: "red",
		color: "bg-red-500/40",
	},
	warning: {
		type: "warning",
		variant: "orange",
		color: "bg-orange-500/40",
	},
	debug: {
		type: "debug",
		variant: "yellow",
		color: "bg-yellow-500/40",
	},
	success: {
		type: "success",
		variant: "green",
		color: "bg-green-500/40",
	},
	info: {
		type: "info",
		variant: "blue",
		color: "bg-blue-600/40",
	},
} as const;

export function parseLogs(logString: string): LogLine[] {
	// Regex to match the log line format
	// Example of return :
	// 1 2024-12-10T10:00:00.000Z The server is running on port 8080
	// Should return :
	// { timestamp: new Date("2024-12-10T10:00:00.000Z"),
	// message: "The server is running on port 8080" }
	const logRegex =
		/^(?:(\d+)\s+)?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} UTC)?\s*(.*)$/;

	return logString
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.map((line) => {
			const match = line.match(logRegex);
			if (!match) return null;

			const [, , timestamp, message] = match;

			if (!message?.trim()) return null;

			return {
				rawTimestamp: timestamp ?? null,
				timestamp: timestamp ? new Date(timestamp.replace(" UTC", "Z")) : null,
				message: message.trim(),
			};
		})
		.filter((log) => log !== null);
}

// Detect log type based on message content
export const getLogType = (message: string): LogStyle => {
	const lowerMessage = message.toLowerCase();

	if (
		/(?:^|\s)(?:info|inf|information):?\s/i.test(lowerMessage) ||
		/\[(?:info|information)\]/i.test(lowerMessage) ||
		/\b(?:status|state|current|progress)\b:?\s/i.test(lowerMessage) ||
		/\b(?:processing|executing|performing)\b/i.test(lowerMessage)
	) {
		return LOG_STYLES.info;
	}

	if (
		/(?:^|\s)(?:error|err):?\s/i.test(lowerMessage) ||
		/\b(?:exception|failed|failure)\b/i.test(lowerMessage) ||
		/(?:stack\s?trace):\s*$/i.test(lowerMessage) ||
		/^\s*at\s+[\w.]+\s*\(?.+:\d+:\d+\)?/.test(lowerMessage) ||
		/\b(?:uncaught|unhandled)\s+(?:exception|error)\b/i.test(lowerMessage) ||
		/Error:\s.*(?:in|at)\s+.*:\d+(?::\d+)?/.test(lowerMessage) ||
		/\b(?:errno|code):\s*(?:\d+|[A-Z_]+)\b/i.test(lowerMessage) ||
		/\[(?:error|err|fatal)\]/i.test(lowerMessage) ||
		/\b(?:crash|critical|fatal)\b/i.test(lowerMessage) ||
		/\b(?:fail(?:ed|ure)?|broken|dead)\b/i.test(lowerMessage)
	) {
		return LOG_STYLES.error;
	}

	if (
		/(?:^|\s)(?:warning|warn):?\s/i.test(lowerMessage) ||
		/\[(?:warn(?:ing)?|attention)\]/i.test(lowerMessage) ||
		/(?:deprecated|obsolete)\s+(?:since|in|as\s+of)/i.test(lowerMessage) ||
		/\b(?:caution|attention|notice):\s/i.test(lowerMessage) ||
		/(?:might|may|could)\s+(?:not|cause|lead\s+to)/i.test(lowerMessage) ||
		/(?:!+\s*(?:warning|caution|attention)\s*!+)/i.test(lowerMessage) ||
		/\b(?:deprecated|obsolete)\b/i.test(lowerMessage) ||
		/\b(?:unstable|experimental)\b/i.test(lowerMessage)
	) {
		return LOG_STYLES.warning;
	}

	if (
		/(?:successfully|complete[d]?)\s+(?:initialized|started|completed|created|done|deployed)/i.test(
			lowerMessage,
		) ||
		/\[(?:success|ok|done)\]/i.test(lowerMessage) ||
		/(?:listening|running)\s+(?:on|at)\s+(?:port\s+)?\d+/i.test(lowerMessage) ||
		/(?:connected|established|ready)\s+(?:to|for|on)/i.test(lowerMessage) ||
		/\b(?:loaded|mounted|initialized)\s+successfully\b/i.test(lowerMessage) ||
		/✓|√|✅|\[ok\]|done!/i.test(lowerMessage) ||
		/\b(?:success(?:ful)?|completed|ready)\b/i.test(lowerMessage) ||
		/\b(?:started|starting|active)\b/i.test(lowerMessage)
	) {
		return LOG_STYLES.success;
	}

	if (
		/(?:^|\s)(?:info|inf):?\s/i.test(lowerMessage) ||
		/\[(info|log|debug|trace|server|db|api|http|request|response)\]/i.test(
			lowerMessage,
		) ||
		/\b(?:version|config|import|load|get|HTTP|PATCH|POST|debug)\b:?/i.test(
			lowerMessage,
		)
	) {
		return LOG_STYLES.debug;
	}

	return LOG_STYLES.info;
};
