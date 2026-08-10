import {
	canGenerateLicensedOrganizationScopedSCIMToken,
	canGenerateOrganizationScopedSCIMToken,
	DISABLED_PERSONAL_SCIM_MANAGEMENT_PATHS,
} from "@dokploy/server/lib/scim-security";
import { describe, expect, it, vi } from "vitest";

describe("SCIM management boundaries", () => {
	it("allows token generation only for an organization member", () => {
		expect(
			canGenerateOrganizationScopedSCIMToken({
				organizationId: "org-1",
				member: { role: "owner" },
			}),
		).toBe(true);
	});

	it.each([
		{ organizationId: undefined, member: null },
		{ organizationId: undefined, member: { role: "owner" } },
		{ organizationId: "org-1", member: null },
	])("rejects personal or membership-free token generation", (input) => {
		expect(canGenerateOrganizationScopedSCIMToken(input)).toBe(false);
	});

	it("requires a valid license for organization token generation", async () => {
		const input = {
			organizationId: "org-1",
			member: { role: "owner" },
		};
		await expect(
			canGenerateLicensedOrganizationScopedSCIMToken(input, async () => true),
		).resolves.toBe(true);
		await expect(
			canGenerateLicensedOrganizationScopedSCIMToken(input, async () => false),
		).resolves.toBe(false);
	});

	it("does not perform a license lookup for personal token generation", async () => {
		const hasValidLicense = vi.fn(async () => true);
		await expect(
			canGenerateLicensedOrganizationScopedSCIMToken(
				{ organizationId: undefined, member: null },
				hasValidLicense,
			),
		).resolves.toBe(false);
		expect(hasValidLicense).not.toHaveBeenCalled();
	});

	it("disables raw personal-provider management endpoints", () => {
		expect(DISABLED_PERSONAL_SCIM_MANAGEMENT_PATHS).toEqual([
			"/scim/list-provider-connections",
			"/scim/get-provider-connection",
			"/scim/delete-provider-connection",
		]);
	});
});
