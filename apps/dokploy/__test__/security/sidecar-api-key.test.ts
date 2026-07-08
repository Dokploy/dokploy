import { describe, expect, it } from "vitest";
import { isValidApiKey as isValidDeploymentsApiKey } from "../../../api/src/auth";
import { isValidApiKey as isValidSchedulesApiKey } from "../../../schedules/src/auth";

const apiKeyValidators = [
	["deployments api", isValidDeploymentsApiKey],
	["schedules api", isValidSchedulesApiKey],
] as const;

describe.each(apiKeyValidators)("%s API key validation", (_name, validate) => {
	it("fails closed when the configured API key is missing or blank", () => {
		expect(validate(undefined, undefined)).toBe(false);
		expect(validate("", "")).toBe(false);
		expect(validate("   ", "   ")).toBe(false);
		expect(validate(undefined, "secret")).toBe(false);
	});

	it("requires a nonblank matching request header", () => {
		expect(validate("secret", undefined)).toBe(false);
		expect(validate("secret", "")).toBe(false);
		expect(validate("secret", "   ")).toBe(false);
		expect(validate("secret", "wrong")).toBe(false);
		expect(validate("secret", " secret")).toBe(false);
		expect(validate("secret", "secret")).toBe(true);
	});
});
