import { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getOrganizationDescription,
	ORGANIZATION_DESCRIPTION_MAX_LENGTH,
	organizationDescriptionSchema,
	setOrganizationDescription,
} from "@/lib/organization-description";
import { organizationRouter } from "@/server/api/routers/organization";

const mocks = vi.hoisted(() => ({
	findOrganization: vi.fn(),
	findMember: vi.fn(),
	findMembers: vi.fn(),
	insert: vi.fn(),
	values: vi.fn(),
	update: vi.fn(),
	set: vi.fn(),
	where: vi.fn(),
	returning: vi.fn(),
	audit: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			organization: { findFirst: mocks.findOrganization },
			member: {
				findFirst: mocks.findMember,
				findMany: mocks.findMembers,
			},
		},
		insert: mocks.insert,
		update: mocks.update,
	},
}));
vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	hasValidLicense: vi.fn(),
	sendInvitationEmail: vi.fn(),
}));
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(),
}));
vi.mock("@/server/api/utils/plan-limits", () => ({
	assertMemberLimit: vi.fn(),
	assertOrganizationLimit: vi.fn(),
}));
vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

const existingMetadata = JSON.stringify({
	description: "Old description",
	billing: { customerId: "customer-1" },
	flags: ["sso"],
});
const org = {
	id: "org-1",
	name: "Organization",
	ownerId: "owner-1",
	metadata: existingMetadata,
};

function caller(userId = "owner-1") {
	return organizationRouter.createCaller({
		user: { id: userId, role: "owner", email: "owner@example.com" },
		session: { activeOrganizationId: org.id },
	} as Parameters<typeof organizationRouter.createCaller>[0]);
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.findOrganization.mockResolvedValue(org);
	mocks.findMember.mockResolvedValue({ role: "owner" });
	mocks.findMembers.mockResolvedValue([]);
	mocks.insert.mockReturnValue({ values: mocks.values });
	mocks.values.mockReturnValue({ returning: mocks.returning });
	mocks.update.mockReturnValue({ set: mocks.set });
	mocks.set.mockReturnValue({ where: mocks.where });
	mocks.where.mockReturnValue({ returning: mocks.returning });
	mocks.returning.mockResolvedValue([org]);
});

describe("organization description metadata", () => {
	it("trims descriptions and allows omission or clearing", () => {
		expect(organizationDescriptionSchema.parse("  Example  ")).toBe("Example");
		expect(organizationDescriptionSchema.parse(undefined)).toBeUndefined();
		expect(organizationDescriptionSchema.parse("  ")).toBe("");
	});

	it("validates length and input type", () => {
		expect(
			organizationDescriptionSchema.safeParse(
				"x".repeat(ORGANIZATION_DESCRIPTION_MAX_LENGTH),
			).success,
		).toBe(true);
		expect(
			organizationDescriptionSchema.safeParse(
				"x".repeat(ORGANIZATION_DESCRIPTION_MAX_LENGTH + 1),
			).success,
		).toBe(false);
		expect(organizationDescriptionSchema.safeParse(123).success).toBe(false);
	});

	it("reads existing descriptions", () => {
		expect(getOrganizationDescription(existingMetadata)).toBe(
			"Old description",
		);
	});

	it.each([null, undefined, "", "invalid", "[]", "null", '{"description":12}'])(
		"displays an empty description for legacy metadata %s",
		(metadata) => {
			expect(getOrganizationDescription(metadata)).toBe("");
		},
	);

	it("preserves unrelated metadata when changing or clearing a description", () => {
		for (const description of ["New description", ""]) {
			expect(
				JSON.parse(setOrganizationDescription(existingMetadata, description)),
			).toEqual({
				description,
				billing: { customerId: "customer-1" },
				flags: ["sso"],
			});
		}
	});

	it.each(["invalid", "[]", "null", '"text"', "42"])(
		"refuses to overwrite unsupported metadata %s",
		(metadata) => {
			expect(() => setOrganizationDescription(metadata, "New")).toThrow();
		},
	);
});

describe("organization description mutations", () => {
	it("stores a description when creating an organization and audits the creation", async () => {
		await caller().create({
			name: org.name,
			description: "  New description  ",
		});
		expect(mocks.values).toHaveBeenCalledWith(
			expect.objectContaining({
				name: org.name,
				ownerId: "owner-1",
				metadata: JSON.stringify({ description: "New description" }),
			}),
		);
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ action: "create", resourceId: org.id }),
		);
	});

	it.each(["New description", ""])(
		"saves description %s without losing unrelated metadata",
		async (description) => {
			await caller().update({
				organizationId: org.id,
				name: org.name,
				description,
			});
			const written = mocks.set.mock.calls.at(-1)?.[0] ?? {};
			// the write is key-scoped (jsonb_set on {description}) so a
			// concurrent saveCustomAiProviders can't erase unrelated keys
			expect(written.metadata).toBeInstanceOf(SQL);
			// drizzle SQL chunks: StringChunk.value is string[] (static sql),
			// Param.value is the bound scalar — duck-type to avoid the
			// circular column refs that break JSON.stringify
			const chunks =
				(written.metadata as { queryChunks?: unknown[] }).queryChunks ?? [];
			const staticSql = chunks
				.flatMap((ch) => {
					const v = (ch as { value?: unknown })?.value;
					return Array.isArray(v)
						? v.filter((s): s is string => typeof s === "string")
						: [];
				})
				.join(" ");
			const boundParams = chunks.filter((ch) => typeof ch === "string");
			expect(staticSql).toContain("jsonb_set");
			expect(staticSql).toContain("description");
			expect(boundParams).toContain(description);
			expect(mocks.audit).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ action: "update", resourceId: org.id }),
			);
		},
	);

	it("leaves metadata untouched when the description is omitted", async () => {
		await caller().update({ organizationId: org.id, name: "Renamed" });
		expect(mocks.set).toHaveBeenCalledWith({
			name: "Renamed",
			logo: undefined,
		});
	});

	it("still permits name-only updates with legacy non-JSON metadata", async () => {
		mocks.findOrganization.mockResolvedValue({ ...org, metadata: "legacy" });
		await caller().update({ organizationId: org.id, name: "Renamed" });
		expect(mocks.set).toHaveBeenCalledWith({
			name: "Renamed",
			logo: undefined,
		});
	});

	it("adds a description to an organization with no metadata", async () => {
		mocks.findOrganization.mockResolvedValue({ ...org, metadata: null });
		await caller().update({
			organizationId: org.id,
			name: org.name,
			description: "New description",
		});
		const written = mocks.set.mock.calls.at(-1)?.[0] ?? {};
		expect(written.metadata).toBeInstanceOf(SQL);
	});

	it.each(["create", "update"] as const)(
		"rejects an oversized description on %s before writing",
		async (mutation) => {
			await expect(
				caller()[mutation]({
					organizationId: org.id,
					name: org.name,
					description: "x".repeat(ORGANIZATION_DESCRIPTION_MAX_LENGTH + 1),
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(mocks.insert).not.toHaveBeenCalled();
			expect(mocks.update).not.toHaveBeenCalled();
		},
	);

	it("refuses malformed metadata without modifying the organization", async () => {
		mocks.findOrganization.mockResolvedValue({ ...org, metadata: "invalid" });
		await expect(
			caller().update({
				organizationId: org.id,
				name: org.name,
				description: "New description",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it.each(["admin", "member"])(
		"prevents a %s from updating the description",
		async (role) => {
			mocks.findMember.mockResolvedValue({ role });
			await expect(
				caller("other-user").update({
					organizationId: org.id,
					name: org.name,
					description: "New description",
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(mocks.update).not.toHaveBeenCalled();
		},
	);

	it("prevents a non-member from updating another organization's description", async () => {
		mocks.findMember.mockResolvedValue(undefined);
		await expect(
			caller("outsider").update({
				organizationId: org.id,
				name: org.name,
				description: "New description",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.update).not.toHaveBeenCalled();
	});
});
