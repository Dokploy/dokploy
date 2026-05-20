import { isDokployRegistrationAllowed } from "@dokploy/server/constants";
import { describe, expect, it } from "vitest";

describe("registration configuration", () => {
	it("only enables opt-in registration for the explicit true value", () => {
		expect(isDokployRegistrationAllowed("true")).toBe(true);
		expect(isDokployRegistrationAllowed("false")).toBe(false);
		expect(isDokployRegistrationAllowed("1")).toBe(false);
		expect(isDokployRegistrationAllowed(undefined)).toBe(false);
	});
});
