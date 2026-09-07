import { beforeEach, describe, expect, it, vi } from "vitest";

// `canViewGitProviderSecrets` was introduced by a42614004 to gate which callers
// may read raw git-provider credentials, but it shipped without tests. It backs
// the `bitbucket.one` redaction and is the privilege the `bitbucket.update`
// leak violated. Cover it directly using the same DB-one-layer-down style as
// git-provider-access.test.ts / git-provider-idor.test.ts.
const mockDb = vi.hoisted(() => ({
	query: {
		member: {
			findFirst: vi.fn(),
		},
	},
}));
vi.mock("@dokploy/server/db", () => ({ db: mockDb }));

import { canViewGitProviderSecrets } from "@dokploy/server/services/git-provider";

const ORG = "org-1";
const session = (userId: string) => ({ userId, activeOrganizationId: ORG });

beforeEach(() => {
	vi.clearAllMocks();
});

describe("canViewGitProviderSecrets", () => {
	describe("provider owner", () => {
		it("allows the provider's owner to view secrets", async () => {
			const provider = { userId: "u-1", organizationId: ORG };
			expect(await canViewGitProviderSecrets(session("u-1"), provider)).toBe(
				true,
			);
			expect(mockDb.query.member.findFirst).not.toHaveBeenCalled();
		});
	});

	describe("cross-org", () => {
		it("denies even the owner when the provider is in another org", async () => {
			const provider = { userId: "u-1", organizationId: "org-2" };
			expect(await canViewGitProviderSecrets(session("u-1"), provider)).toBe(
				false,
			);
			expect(mockDb.query.member.findFirst).not.toHaveBeenCalled();
		});
	});

	describe("same org, non-owner caller", () => {
		const provider = { userId: "owner-u", organizationId: ORG };

		it("allows an org owner", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({ role: "owner" });
			expect(await canViewGitProviderSecrets(session("u-2"), provider)).toBe(
				true,
			);
		});

		it("allows an org admin", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({ role: "admin" });
			expect(await canViewGitProviderSecrets(session("u-2"), provider)).toBe(
				true,
			);
		});

		it("denies a regular member", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({ role: "member" });
			expect(await canViewGitProviderSecrets(session("u-2"), provider)).toBe(
				false,
			);
		});

		it("denies when there is no member record", async () => {
			mockDb.query.member.findFirst.mockResolvedValue(null);
			expect(await canViewGitProviderSecrets(session("u-2"), provider)).toBe(
				false,
			);
		});

		it("denies a custom non-admin/non-owner role", async () => {
			mockDb.query.member.findFirst.mockResolvedValue({ role: "viewer" });
			expect(await canViewGitProviderSecrets(session("u-2"), provider)).toBe(
				false,
			);
		});
	});
});
