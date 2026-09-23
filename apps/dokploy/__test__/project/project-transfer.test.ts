import { apiUpdateProject } from "@dokploy/server/db/schema/project";
import { getProjectTransferBlockers } from "@dokploy/server/services/project-transfer";
import { describe, expect, it } from "vitest";

const baseInput = {
	sourceRole: "owner",
	targetRole: "admin",
	sourceOrganizationId: "source-org",
	targetOrganizationId: "target-org",
	projectFound: true,
	targetFound: true,
	serviceCount: 0,
};

describe("project transfer preflight", () => {
	it("allows an empty project for admins of both organizations", () => {
		expect(getProjectTransferBlockers(baseInput)).toEqual([]);
	});

	it("blocks service-bearing projects until their dependencies can migrate", () => {
		expect(
			getProjectTransferBlockers({ ...baseInput, serviceCount: 2 }),
		).toEqual([
			{
				code: "SERVICES_REQUIRE_MIGRATION",
				message:
					"This project contains services that reference organization-owned infrastructure. Migrate those dependencies before transferring the project.",
				resourceCount: 2,
			},
		]);
	});

	it("requires privileged access in the destination organization", () => {
		const blockers = getProjectTransferBlockers({
			...baseInput,
			targetRole: "member",
		});

		expect(blockers).toContainEqual({
			code: "TARGET_ACCESS_REQUIRED",
			message: "You must be an owner or admin of the destination organization.",
		});
	});

	it("does not reveal a project across organization boundaries", () => {
		const blockers = getProjectTransferBlockers({
			...baseInput,
			projectFound: false,
		});

		expect(blockers[0]).toEqual({
			code: "PROJECT_NOT_FOUND",
			message: "The project was not found in the active organization.",
		});
	});

	it("does not allow the general update API to change organization ownership", () => {
		const parsed = apiUpdateProject.parse({
			projectId: "project-1",
			organizationId: "target-org",
		});

		expect(parsed).toEqual({ projectId: "project-1" });
	});
});
