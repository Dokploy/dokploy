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
		/^(?:(?<lineNumber>\d+)\s+)?(?<timestamp>(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} UTC))?\s*(?<message>[\s\S]*)$/;

	return logString
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.map((line) => {
			const match = line.match(logRegex);
			if (!match) return null;

			const { timestamp, message } = match.groups ?? {};

			if (!message?.trim()) return null;

			return {
				rawTimestamp: timestamp ?? null,
				timestamp: timestamp ? new Date(timestamp.replace(" UTC", "Z")) : null,
				message: message.trim(),
			};
		})
		.filter((log) => log !== null);
}

interface LogPattern {
	pattern: RegExp;
	score: number;
	type: LogType;
}

// Priority for tie-breaking: higher priority wins when scores are equal
const LOG_TYPE_PRIORITY: Record<LogType, number> = {
	error: 5,
	warning: 4,
	success: 3,
	info: 2,
	debug: 1,
};

const isNegativeContext = (message: string, keyword: string): boolean => {
	const lowerMessage = message.toLowerCase();
	const lowerKeyword = keyword.toLowerCase();

	// Allow up to 3 words between negation and keyword
	const negativePatterns = [
		`(?:not|no|without|won't|didn't|doesn't|never)\\s+(?:\\w+\\s+){0,3}${lowerKeyword}`,
		`${lowerKeyword}\\s+(?:is|was)\\s+(?:not|never|avoided|prevented)`,
		`prevent(?:s|ed|ing)?\\s+(?:\\w+\\s+){0,2}${lowerKeyword}`,
		`avoid(?:s|ed|ing)?\\s+(?:\\w+\\s+){0,2}${lowerKeyword}`,
		`if\\s+.*${lowerKeyword}`,
		`when\\s+.*${lowerKeyword}`,
	];

	return negativePatterns.some((pattern) =>
		new RegExp(pattern, "i").test(lowerMessage),
	);
};

export const getLogType = (message: string): LogStyle => {
	const lowerMessage = message.toLowerCase();

	const scores: Record<LogType, number> = {
		error: 0,
		warning: 0,
		success: 0,
		info: 0,
		debug: 0,
	};

	const structuredPatterns: LogPattern[] = [
		{
			pattern: /\[(?:error|err|fatal|crit(?:ical)?)\]/i,
			score: 100,
			type: "error",
		},
		{
			pattern: /^(?:error|err|fatal|crit(?:ical)?):?\s/i,
			score: 100,
			type: "error",
		},
		{
			pattern: /level=(?:error|fatal|crit(?:ical)?)/i,
			score: 100,
			type: "error",
		},
		{
			pattern: /severity=(?:error|fatal|crit(?:ical)?)/i,
			score: 100,
			type: "error",
		},
		{ pattern: /❌|🔴|🚨/, score: 100, type: "error" },

		{
			pattern: /\[(?:warn(?:ing)?|attention|notice)\]/i,
			score: 100,
			type: "warning",
		},
		{ pattern: /^(?:warn(?:ing)?):?\s/i, score: 100, type: "warning" },
		{ pattern: /level=(?:warn(?:ing)?)/i, score: 100, type: "warning" },
		{ pattern: /severity=(?:warn(?:ing)?)/i, score: 100, type: "warning" },
		{ pattern: /⚠️|⚠|⛔/, score: 100, type: "warning" },

		{ pattern: /\[(?:info|information)\]/i, score: 100, type: "info" },
		{ pattern: /^(?:info|information):?\s/i, score: 100, type: "info" },
		{ pattern: /level=(?:info|information)/i, score: 100, type: "info" },

		{ pattern: /\[(?:debug|trace|verbose)\]/i, score: 100, type: "debug" },
		{ pattern: /^(?:debug|trace):?\s/i, score: 100, type: "debug" },
		{ pattern: /level=(?:debug|trace)/i, score: 100, type: "debug" },

		{ pattern: /\[(?:success|ok|done)\]/i, score: 100, type: "success" },
		{ pattern: /✓|√|✅/, score: 100, type: "success" },
		{ pattern: /\[ok\]/i, score: 100, type: "success" },
	];

	const contextualPatterns: LogPattern[] = [
		{
			pattern: /(?:uncaught|unhandled)\s+(?:exception|error|rejection)/i,
			score: 70,
			type: "error",
		},
		{
			pattern: /(?:stack\s?trace|call\s+stack)(?::|$)/i,
			score: 70,
			type: "error",
		},
		{
			pattern: /^\s*at\s+[\w.<>$]+\s*\([^)]*:\d+:\d+\)/i,
			score: 70,
			type: "error",
		},
		{ pattern: /Error:\s+.*(?:at|in)\s+.*:\d+/i, score: 70, type: "error" },

		{
			pattern: /\b(?:status|code)[:\s]+(?:4\d{2}|5\d{2})\b/i,
			score: 70,
			type: "error",
		},
		{
			pattern:
				/\b(?:4\d{2}|5\d{2})\s+(?:error|bad\s+request|unauthorized|forbidden|not\s+found|internal\s+server\s+error)/i,
			score: 70,
			type: "error",
		},

		{
			pattern: /\b\w+\s+(?:failed|failure)\s+(?:with|at|in|on|for|to)/i,
			score: 65,
			type: "error",
		},
		{ pattern: /(?:failed|unable)\s+to\s+\w+/i, score: 60, type: "error" },
		{
			pattern: /(?:error|exception)\s+(?:occurred|thrown|raised|caught)/i,
			score: 60,
			type: "error",
		},
		{
			pattern: /(?:connection|request|operation)\s+(?:failed|error)/i,
			score: 60,
			type: "error",
		},
		{
			pattern: /\b(?:errno|exitcode):\s*(?:\d+|[A-Z_]+)/i,
			score: 60,
			type: "error",
		},
		{
			pattern: /\b(?:crash(?:ed)?|fatal\s+error)\b/i,
			score: 60,
			type: "error",
		},

		{
			pattern: /(?:deprecated|obsolete)(?:\s+since|\s+in|\s+as\s+of)/i,
			score: 60,
			type: "warning",
		},
		{ pattern: /(?:caution|attention|notice):/i, score: 60, type: "warning" },
		{
			pattern: /!+\s*(?:warning|caution|attention)\s*!+/i,
			score: 60,
			type: "warning",
		},
		{
			pattern:
				/(?:might|may|could)\s+(?:cause|lead\s+to)\s+(?:error|issue|problem)/i,
			score: 50,
			type: "warning",
		},

		{
			pattern:
				/(?:successfully|complete[d]?)\s+(?:initialized|started|completed|created|deployed|connected)/i,
			score: 60,
			type: "success",
		},
		{
			pattern: /(?:listening|running)\s+(?:on|at)\s+(?:port\s+)?\d+/i,
			score: 60,
			type: "success",
		},
		{
			pattern: /(?:connected|established|ready)\s+(?:to|for|on)/i,
			score: 50,
			type: "success",
		},
		{
			pattern: /\b(?:loaded|mounted|initialized)\s+successfully/i,
			score: 60,
			type: "success",
		},

		{
			pattern: /^(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/i,
			score: 50,
			type: "debug",
		},
		{ pattern: /\b(?:request|response|query):/i, score: 50, type: "debug" },
	];

	const keywordPatterns: LogPattern[] = [
		{
			pattern: /\b(?:exception|crash|critical|fatal)\b/i,
			score: 30,
			type: "error",
		},
		{
			pattern: /\b(?:deprecated|obsolete|unstable|experimental)\b/i,
			score: 25,
			type: "warning",
		},
		{
			pattern: /\b(?:success(?:ful)?|completed|ready)\b/i,
			score: 20,
			type: "success",
		},
	];

	for (const { pattern, score, type } of structuredPatterns) {
		if (pattern.test(lowerMessage)) {
			scores[type] += score;
		}
	}

	for (const { pattern, score, type } of contextualPatterns) {
		if (pattern.test(lowerMessage)) {
			scores[type] += score;
		}
	}

	for (const { pattern, score, type } of keywordPatterns) {
		const match = pattern.exec(lowerMessage);
		if (match && !isNegativeContext(message, match[0])) {
			scores[type] += score;
		}
	}

	let maxScore = 0;
	let detectedType: LogType = "info";

	for (const [type, score] of Object.entries(scores)) {
		const logType = type as LogType;
		// Use explicit priority for tie-breaking when scores are equal
		if (
			score > maxScore ||
			(score === maxScore &&
				score > 0 &&
				LOG_TYPE_PRIORITY[logType] > LOG_TYPE_PRIORITY[detectedType])
		) {
			maxScore = score;
			detectedType = logType;
		}
	}

	return LOG_STYLES[detectedType];
};
