import {
	isDokployRegistrationAllowed,
	shouldCreateDefaultOrganizationForSignUp,
} from "@dokploy/server/constants";
import { describe, expect, it } from "vitest";

describe("registration configuration", () => {
	it("only enables opt-in registration for the explicit true value", () => {
		expect(isDokployRegistrationAllowed("true")).toBe(true);
		expect(isDokployRegistrationAllowed("false")).toBe(false);
		expect(isDokployRegistrationAllowed("1")).toBe(false);
		expect(isDokployRegistrationAllowed(undefined)).toBe(false);
	});

	it("keeps invited self-hosted signups out of open-registration org creation", () => {
		expect(
			shouldCreateDefaultOrganizationForSignUp({
				isCloud: false,
				hasOwner: true,
				isSSORequest: false,
				hasInvitation: true,
				registrationAllowed: true,
			}),
		).toBe(false);

		expect(
			shouldCreateDefaultOrganizationForSignUp({
				isCloud: false,
				hasOwner: true,
				isSSORequest: false,
				hasInvitation: false,
				registrationAllowed: true,
			}),
		).toBe(true);
	});
});
