export interface SwarmHealthCheck {
	Test?: string[] | undefined;
	Interval?: number | undefined;
	Timeout?: number | undefined;
	StartPeriod?: number | undefined;
	Retries?: number | undefined;
}

const HEALTH_CHECK_INSTRUCTIONS = new Set(["CMD", "CMD-SHELL", "NONE"]);

const invalidJsonArrayError = () =>
	new Error("Health check Test must be a JSON array of strings");

export const normalizeSwarmHealthCheckTest = (
	test: string[] | undefined,
): string[] | undefined => {
	if (!test || test.length === 0) {
		return undefined;
	}

	if (test.length === 1) {
		const value = test[0]?.trim() ?? "";
		if (!value) {
			return ["NONE"];
		}

		if (value.startsWith("[")) {
			let parsed: unknown;
			try {
				parsed = JSON.parse(value);
			} catch {
				// POSIX test expressions are valid shell commands, not JSON arrays.
				if (/^\[\s+[^,\r\n]+\s+\]$/.test(value)) {
					return ["CMD-SHELL", value];
				}
				throw invalidJsonArrayError();
			}

			if (
				!Array.isArray(parsed) ||
				parsed.some((command) => typeof command !== "string")
			) {
				throw invalidJsonArrayError();
			}

			return normalizeSwarmHealthCheckTest(parsed);
		}

		const instruction = value.toUpperCase();
		if (instruction === "NONE") {
			return ["NONE"];
		}
		if (instruction === "CMD" || instruction === "CMD-SHELL") {
			throw new Error(`${instruction} health checks require a command`);
		}

		return ["CMD-SHELL", value];
	}

	const instruction = test[0]?.trim().toUpperCase() ?? "";
	if (!HEALTH_CHECK_INSTRUCTIONS.has(instruction)) {
		throw new Error(
			"Health check Test must begin with CMD, CMD-SHELL, or NONE",
		);
	}

	if (instruction === "NONE") {
		if (test.slice(1).some((command) => command.trim().length > 0)) {
			throw new Error(
				"NONE cannot be combined with another health check command",
			);
		}
		return ["NONE"];
	}

	if (!test.slice(1).some((command) => command.trim().length > 0)) {
		throw new Error(`${instruction} health checks require a command`);
	}

	return [instruction, ...test.slice(1)];
};

export const normalizeSwarmHealthCheck = (
	healthCheck: SwarmHealthCheck | null | undefined,
): SwarmHealthCheck | undefined => {
	if (!healthCheck) {
		return undefined;
	}

	const { Test, ...options } = healthCheck;
	const normalizedTest = normalizeSwarmHealthCheckTest(Test);
	const hasOptions = Object.values(options).some(
		(value) => value !== undefined,
	);

	if (!normalizedTest && !hasOptions) {
		return undefined;
	}

	return {
		...options,
		...(normalizedTest && { Test: normalizedTest }),
	};
};
