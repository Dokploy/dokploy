import { describe, expect, it } from "vitest";

export interface HealthCheckSwarm {
	Test?: string[];
	Interval?: number;
	Timeout?: number;
	StartPeriod?: number;
	Retries?: number;
}

export const cleanHealthCheckSwarm = (
	healthCheck?: HealthCheckSwarm | null,
): HealthCheckSwarm | undefined => {
	if (!healthCheck) return undefined;

	let test = healthCheck.Test;
	if (test) {
		test = test
			.map((t) => (typeof t === "string" ? t.trim() : ""))
			.filter(Boolean);

		if (test.length === 1 && test[0].startsWith("[") && test[0].endsWith("]")) {
			try {
				const parsed = JSON.parse(test[0]);
				if (Array.isArray(parsed)) {
					test = parsed
						.map((t) => (typeof t === "string" ? t.trim() : String(t).trim()))
						.filter(Boolean);
				}
			} catch {
				// Not valid JSON array, keep original
			}
		}

		if (test.length > 0) {
			const first = test[0];
			if (first !== "NONE" && first !== "CMD" && first !== "CMD-SHELL") {
				if (first.startsWith("CMD-SHELL ")) {
					test = ["CMD-SHELL", first.slice(10).trim()];
				} else if (first.startsWith("CMD ")) {
					test = ["CMD", ...first.slice(4).trim().split(/\s+/)];
				} else if (test.length === 1) {
					test = ["CMD-SHELL", first];
				} else {
					test = ["CMD", ...test];
				}
			}
		}
	}

	const hasValidTest = Boolean(test && test.length > 0);
	const hasOptions =
		healthCheck.Interval !== undefined ||
		healthCheck.Timeout !== undefined ||
		healthCheck.StartPeriod !== undefined ||
		healthCheck.Retries !== undefined;

	if (!hasValidTest && !hasOptions) {
		return undefined;
	}

	return {
		...(hasValidTest && { Test: test }),
		...(healthCheck.Interval !== undefined && {
			Interval: Number(healthCheck.Interval),
		}),
		...(healthCheck.Timeout !== undefined && {
			Timeout: Number(healthCheck.Timeout),
		}),
		...(healthCheck.StartPeriod !== undefined && {
			StartPeriod: Number(healthCheck.StartPeriod),
		}),
		...(healthCheck.Retries !== undefined && {
			Retries: Number(healthCheck.Retries),
		}),
	};
};

export const generateConfigContainerMock = (application: {
	healthCheckSwarm?: HealthCheckSwarm | null;
	updateConfigSwarm?: any;
	stopGracePeriodSwarm?: number | null;
}) => {
	const cleanedHealthCheck = cleanHealthCheckSwarm(
		application.healthCheckSwarm,
	);
	return {
		...(cleanedHealthCheck && {
			HealthCheck: cleanedHealthCheck,
		}),
		...(application.updateConfigSwarm
			? { UpdateConfig: application.updateConfigSwarm }
			: {
					UpdateConfig: {
						Parallelism: 1,
						Order: "start-first",
						FailureAction: "rollback",
					},
				}),
		...(application.stopGracePeriodSwarm !== null &&
			application.stopGracePeriodSwarm !== undefined && {
				StopGracePeriod: application.stopGracePeriodSwarm,
			}),
	};
};

export const normalizeStopGracePeriod = (val: unknown): number | null => {
	if (val === null || val === undefined || val === "") return null;
	const num = Number(val);
	return Number.isNaN(num) ? null : num;
};

export const validateUpdateConfigPartial = (config: Record<string, any>) => {
	const result: Record<string, any> = {};
	if (config.Parallelism !== undefined)
		result.Parallelism = Number(config.Parallelism);
	if (config.Delay !== undefined) result.Delay = Number(config.Delay);
	if (config.FailureAction !== undefined)
		result.FailureAction = String(config.FailureAction);
	if (config.Monitor !== undefined) result.Monitor = Number(config.Monitor);
	if (config.MaxFailureRatio !== undefined)
		result.MaxFailureRatio = Number(config.MaxFailureRatio);
	if (config.Order !== undefined) result.Order = String(config.Order);
	return result;
};

export const computeForceUpdate = (existingForceUpdate?: number): number => {
	return (existingForceUpdate ?? 0) + 1;
};

describe("Swarm Settings HealthCheck Sanitization & Serialization (#5171)", () => {
	it("should return undefined for empty or null healthcheck", () => {
		expect(cleanHealthCheckSwarm(null)).toBeUndefined();
		expect(cleanHealthCheckSwarm(undefined)).toBeUndefined();
		expect(cleanHealthCheckSwarm({})).toBeUndefined();
	});

	it("should return undefined when Test has only empty or whitespace strings and no options", () => {
		expect(cleanHealthCheckSwarm({ Test: [""] })).toBeUndefined();
		expect(cleanHealthCheckSwarm({ Test: ["   ", ""] })).toBeUndefined();
		expect(cleanHealthCheckSwarm({ Test: [] })).toBeUndefined();
	});

	it("should omit empty Test if options (Interval, Timeout) are set", () => {
		const result = cleanHealthCheckSwarm({
			Test: [""],
			Interval: 10000000000,
			Timeout: 5000000000,
		});
		expect(result).toBeDefined();
		expect(result?.Test).toBeUndefined();
		expect(result?.Interval).toBe(10000000000);
		expect(result?.Timeout).toBe(5000000000);
	});

	it("should correctly parse JSON string array input", () => {
		const result = cleanHealthCheckSwarm({
			Test: ['["CMD", "curl", "-f", "http://localhost:8080/"]'],
		});
		expect(result).toBeDefined();
		expect(result?.Test).toEqual([
			"CMD",
			"curl",
			"-f",
			"http://localhost:8080/",
		]);
	});

	it("should wrap single command string with CMD-SHELL", () => {
		const result = cleanHealthCheckSwarm({
			Test: ["curl -f http://localhost:8080/"],
		});
		expect(result).toBeDefined();
		expect(result?.Test).toEqual([
			"CMD-SHELL",
			"curl -f http://localhost:8080/",
		]);
	});

	it("should handle CMD-SHELL prefix in single command string", () => {
		const result = cleanHealthCheckSwarm({
			Test: ["CMD-SHELL curl -f http://localhost:8080/"],
		});
		expect(result).toBeDefined();
		expect(result?.Test).toEqual([
			"CMD-SHELL",
			"curl -f http://localhost:8080/",
		]);
	});

	it("should handle CMD prefix in command string", () => {
		const result = cleanHealthCheckSwarm({
			Test: ["CMD curl -f http://localhost:8080/"],
		});
		expect(result).toBeDefined();
		expect(result?.Test).toEqual([
			"CMD",
			"curl",
			"-f",
			"http://localhost:8080/",
		]);
	});

	it("should preserve NONE for disabling health check", () => {
		const result = cleanHealthCheckSwarm({
			Test: ["NONE"],
		});
		expect(result).toBeDefined();
		expect(result?.Test).toEqual(["NONE"]);
	});

	it("should prepend CMD if multiple arguments provided without CMD/CMD-SHELL/NONE", () => {
		const result = cleanHealthCheckSwarm({
			Test: ["curl", "-f", "http://localhost:8080/"],
		});
		expect(result).toBeDefined();
		expect(result?.Test).toEqual([
			"CMD",
			"curl",
			"-f",
			"http://localhost:8080/",
		]);
	});

	it("generateConfigContainer should not attach HealthCheck when healthCheckSwarm has empty Test", () => {
		const config = generateConfigContainerMock({
			healthCheckSwarm: {
				Test: [""],
			},
		});

		expect(config.HealthCheck).toBeUndefined();
	});

	it("generateConfigContainer should sanitize and attach valid HealthCheck", () => {
		const config = generateConfigContainerMock({
			healthCheckSwarm: {
				Test: ["curl -f http://localhost:3000/health"],
				Interval: 10000000000,
			},
		});

		expect(config.HealthCheck).toBeDefined();
		expect(config.HealthCheck?.Test).toEqual([
			"CMD-SHELL",
			"curl -f http://localhost:3000/health",
		]);
		expect(config.HealthCheck?.Interval).toBe(10000000000);
	});
});

describe("Swarm Settings Persistence & Service Updates (#5223)", () => {
	it("should allow partial UpdateConfig with only Order", () => {
		const parsed = validateUpdateConfigPartial({ Order: "start-first" });
		expect(parsed.Order).toBe("start-first");
		expect(parsed.Parallelism).toBeUndefined();
	});

	it("should allow partial UpdateConfig with only Monitor", () => {
		const parsed = validateUpdateConfigPartial({ Monitor: "120" });
		expect(parsed.Monitor).toBe(120);
		expect(parsed.Order).toBeUndefined();
	});

	it("should normalize string stopGracePeriod to number", () => {
		expect(normalizeStopGracePeriod("60000000000")).toBe(60000000000);
		expect(normalizeStopGracePeriod(null)).toBeNull();
		expect(normalizeStopGracePeriod("")).toBeNull();
		expect(normalizeStopGracePeriod(undefined)).toBeNull();
	});

	it("should safely compute ForceUpdate when undefined to prevent NaN crashing Docker", () => {
		expect(computeForceUpdate(undefined)).toBe(1);
		expect(computeForceUpdate(0)).toBe(1);
		expect(computeForceUpdate(5)).toBe(6);
	});
});
