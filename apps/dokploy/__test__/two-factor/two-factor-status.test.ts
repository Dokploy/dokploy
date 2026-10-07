import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AccountRow = {
	userId: string;
	providerId: string;
	password: string | null;
};

type MembershipRow = {
	userId: string;
	require2FA: boolean;
	organization: { require2FA: boolean };
};

let accounts: AccountRow[] = [];
let memberships: MembershipRow[] = [];

let invitationRow: { require2FA: boolean } | undefined;
let userRow: { id: string; twoFactorEnabled: boolean } | undefined;
const memberUpdateSet = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
const txDelete = vi.fn((_table: unknown) => ({
	where: vi.fn(async () => undefined),
}));
const txUpdateSet = vi.fn((_values: unknown) => ({
	where: vi.fn(async () => undefined),
}));

const accountFindFirst = vi.fn(
	async () =>
		accounts.find((a) => a.providerId === "credential") as
			| AccountRow
			| undefined,
);
const accountFindMany = vi.fn(async () => accounts);
const memberFindMany = vi.fn(async () => memberships);

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			account: { findFirst: accountFindFirst, findMany: accountFindMany },
			member: { findMany: memberFindMany },
			invitation: {
				findFirst: vi.fn(async () => invitationRow),
			},
			user: { findFirst: vi.fn(async () => userRow) },
		},
		update: vi.fn(() => ({ set: memberUpdateSet })),
		transaction: vi.fn(async (run: (tx: unknown) => Promise<void>) =>
			run({
				delete: txDelete,
				update: vi.fn(() => ({ set: txUpdateSet })),
			}),
		),
	},
}));

const {
	applyInvitationTwoFactorRequirement,
	applyInvitationTwoFactorRequirementOrRevert,
	enforceTwoFactorSetupOnAuthPath,
	assertTwoFactorCanBeDisabled,
	assertTwoFactorSetupComplete,
	getTwoFactorStatuses,
	getUserTwoFactorStatus,
	isTwoFactorRequiredByAnyMembership,
	isTwoFactorSetupAuthPath,
	isTwoFactorSetupPendingForUserId,
	resolveTwoFactorStatus,
	revertInvitationAcceptance,
} = await import("@dokploy/server/services/two-factor-policy");
const { PgDialect } = await import("drizzle-orm/pg-core");
const { member: memberTable } = await import("@dokploy/server/db/schema");

const membership = (
	userId: string,
	{ org = false, member = false } = {},
): MembershipRow => ({
	userId,
	require2FA: member,
	organization: { require2FA: org },
});

const withPassword = (userId = "u1") => {
	accounts.push({ userId, providerId: "credential", password: "hash" });
};

beforeEach(() => {
	vi.clearAllMocks();
	accounts = [];
	memberships = [];
	invitationRow = undefined;
	userRow = undefined;
});

describe("resolveTwoFactorStatus", () => {
	const cases: {
		required: boolean;
		hasPassword: boolean;
		twoFactorEnabled: boolean;
		expected: string;
	}[] = [];
	for (const required of [false, true]) {
		for (const hasPassword of [false, true]) {
			for (const twoFactorEnabled of [false, true]) {
				const expected = twoFactorEnabled
					? "enabled"
					: !hasPassword
						? "sso"
						: required
							? "pending"
							: "not-required";
				cases.push({ required, hasPassword, twoFactorEnabled, expected });
			}
		}
	}

	it.each(cases)(
		"required=$required password=$hasPassword 2fa=$twoFactorEnabled -> $expected",
		({ expected, ...input }) => {
			expect(resolveTwoFactorStatus(input)).toBe(expected);
		},
	);
});

describe("getUserTwoFactorStatus", () => {
	it("is pending when another organization requires 2FA", async () => {
		withPassword();
		memberships = [membership("u1"), membership("u1", { org: true })];

		expect(
			await getUserTwoFactorStatus({ id: "u1", twoFactorEnabled: false }),
		).toBe("pending");
	});

	it("is pending when a member flag requires 2FA", async () => {
		withPassword();
		memberships = [membership("u1", { member: true })];

		expect(
			await getUserTwoFactorStatus({ id: "u1", twoFactorEnabled: false }),
		).toBe("pending");
	});

	it("is sso for a required user without a password", async () => {
		accounts = [{ userId: "u1", providerId: "github", password: null }];
		memberships = [membership("u1", { org: true })];

		expect(
			await getUserTwoFactorStatus({ id: "u1", twoFactorEnabled: false }),
		).toBe("sso");
	});

	it("skips all lookups once 2FA is enabled", async () => {
		expect(
			await getUserTwoFactorStatus({ id: "u1", twoFactorEnabled: true }),
		).toBe("enabled");
		expect(memberFindMany).not.toHaveBeenCalled();
		expect(accountFindFirst).not.toHaveBeenCalled();
	});

	it("skips the password lookup when nothing requires 2FA", async () => {
		memberships = [membership("u1")];

		expect(
			await getUserTwoFactorStatus({ id: "u1", twoFactorEnabled: false }),
		).toBe("not-required");
		expect(accountFindFirst).not.toHaveBeenCalled();
	});

	it("skips the membership lookup with assumeRequired", async () => {
		withPassword();

		expect(
			await getUserTwoFactorStatus(
				{ id: "u1", twoFactorEnabled: false },
				{ assumeRequired: true },
			),
		).toBe("pending");
		expect(memberFindMany).not.toHaveBeenCalled();
	});
});

describe("getTwoFactorStatuses", () => {
	it("resolves user-level status and providers in two queries", async () => {
		accounts = [
			{ userId: "u1", providerId: "credential", password: "hash" },
			{ userId: "u2", providerId: "github", password: null },
			{ userId: "u2", providerId: "google", password: null },
			{ userId: "u4", providerId: "credential", password: "hash" },
			{ userId: "u5", providerId: "github", password: null },
		];
		memberships = [
			membership("u1"),
			membership("u1", { org: true }),
			membership("u2", { member: true }),
			membership("u4"),
			membership("u5"),
		];

		const result = await getTwoFactorStatuses([
			{ id: "u1", twoFactorEnabled: false },
			{ id: "u2", twoFactorEnabled: false },
			{ id: "u3", twoFactorEnabled: true },
			{ id: "u4", twoFactorEnabled: false },
			{ id: "u5", twoFactorEnabled: false },
		]);

		expect(result.get("u1")).toEqual({
			status: "pending",
			providers: ["credential"],
		});
		expect(result.get("u2")).toEqual({
			status: "sso",
			providers: ["github", "google"],
		});
		expect(result.get("u3")).toEqual({ status: "enabled", providers: [] });
		expect(result.get("u4")).toEqual({
			status: "not-required",
			providers: ["credential"],
		});
		expect(result.get("u5")).toEqual({ status: "sso", providers: ["github"] });
		expect(accountFindMany).toHaveBeenCalledTimes(1);
		expect(memberFindMany).toHaveBeenCalledTimes(1);
		expect(accountFindFirst).not.toHaveBeenCalled();
	});

	it("treats everyone as required with assumeRequired", async () => {
		accounts = [{ userId: "u1", providerId: "credential", password: "hash" }];

		const result = await getTwoFactorStatuses(
			[{ id: "u1", twoFactorEnabled: false }],
			{ assumeRequired: true },
		);

		expect(result.get("u1")?.status).toBe("pending");
		expect(memberFindMany).not.toHaveBeenCalled();
	});

	it("doesn't query for an empty list", async () => {
		expect((await getTwoFactorStatuses([])).size).toBe(0);
		expect(accountFindMany).not.toHaveBeenCalled();
	});

	it("only counts the given organization's memberships", async () => {
		await getTwoFactorStatuses([{ id: "u1", twoFactorEnabled: false }], {
			organizationId: "org-1",
		});

		const [[{ where }]] = memberFindMany.mock.calls as unknown as [
			[{ where: SQL }],
		];
		const query = new PgDialect().sqlToQuery(where);
		expect(query.sql).toContain('"organization_id"');
		expect(query.params).toEqual(["u1", "org-1"]);
	});
});

describe("isTwoFactorSetupPendingForUserId", () => {
	it("reads twoFactorEnabled from the database", async () => {
		userRow = { id: "u1", twoFactorEnabled: false };
		withPassword();
		memberships = [membership("u1", { org: true })];

		expect(await isTwoFactorSetupPendingForUserId("u1")).toBe(true);
	});

	it("isn't pending once the stored user has 2FA", async () => {
		userRow = { id: "u1", twoFactorEnabled: true };
		memberships = [membership("u1", { org: true })];

		expect(await isTwoFactorSetupPendingForUserId("u1")).toBe(false);
	});

	it("returns null for a user that no longer exists", async () => {
		expect(await isTwoFactorSetupPendingForUserId("gone")).toBeNull();
	});
});

describe("isTwoFactorRequiredByAnyMembership", () => {
	it("is false when no membership requires 2FA", async () => {
		memberships = [membership("u1"), membership("u1")];
		expect(await isTwoFactorRequiredByAnyMembership("u1")).toBe(false);
	});

	it("is true when any organization switch is on", async () => {
		memberships = [membership("u1"), membership("u1", { org: true })];
		expect(await isTwoFactorRequiredByAnyMembership("u1")).toBe(true);
	});

	it("is true when any member flag is on", async () => {
		memberships = [membership("u1", { member: true })];
		expect(await isTwoFactorRequiredByAnyMembership("u1")).toBe(true);
	});
});

describe("assertTwoFactorCanBeDisabled", () => {
	it("refuses while any membership requires 2FA", async () => {
		memberships = [membership("u1"), membership("u1", { member: true })];
		await expect(assertTwoFactorCanBeDisabled("u1")).rejects.toMatchObject({
			statusCode: 403,
		});
	});

	it("allows it when nothing requires 2FA", async () => {
		memberships = [membership("u1")];
		await expect(assertTwoFactorCanBeDisabled("u1")).resolves.toBeUndefined();
	});
});

describe("better-auth gate", () => {
	it.each([
		"/get-session",
		"/sign-out",
		"/two-factor/enable",
		"/two-factor/verify-totp",
		"/two-factor/get-totp-uri",
	])("allows %s during setup", (path) => {
		expect(isTwoFactorSetupAuthPath(path)).toBe(true);
	});

	it.each([
		"/organization/remove-member",
		"/organization/set-active",
		"/api-key/create",
		"/two-factor/disable",
		"/change-password",
	])("blocks %s during setup", (path) => {
		expect(isTwoFactorSetupAuthPath(path)).toBe(false);
	});

	it("rejects a pending user", async () => {
		withPassword();
		memberships = [membership("u1", { org: true })];

		await expect(
			assertTwoFactorSetupComplete({ id: "u1", twoFactorEnabled: false }),
		).rejects.toMatchObject({ statusCode: 403 });
	});

	it("lets a user through once 2FA is enabled", async () => {
		await expect(
			assertTwoFactorSetupComplete({ id: "u1", twoFactorEnabled: true }),
		).resolves.toBeUndefined();
	});
});

describe("applyInvitationTwoFactorRequirement", () => {
	it("copies the invitation flag onto the new member", async () => {
		invitationRow = { require2FA: true };
		await applyInvitationTwoFactorRequirement({
			invitationId: "inv-1",
			memberId: "m1",
		});
		expect(memberUpdateSet).toHaveBeenCalledWith({ require2FA: true });
	});

	it("leaves the member alone when the invitation doesn't require 2FA", async () => {
		invitationRow = { require2FA: false };
		await applyInvitationTwoFactorRequirement({
			invitationId: "inv-1",
			memberId: "m1",
		});
		expect(memberUpdateSet).not.toHaveBeenCalled();
	});
});

describe("revertInvitationAcceptance", () => {
	it("removes the member, reopens the invitation and clears the active organization", async () => {
		await revertInvitationAcceptance({
			invitationId: "inv-1",
			memberId: "m1",
			userId: "u1",
			organizationId: "org-1",
		});

		expect(txDelete).toHaveBeenCalledWith(memberTable);
		expect(txUpdateSet).toHaveBeenCalledWith({ status: "pending" });
		expect(txUpdateSet).toHaveBeenCalledWith({ activeOrganizationId: null });
	});
});

describe("enforceTwoFactorSetupOnAuthPath", () => {
	const pendingSession = async () => ({
		user: { id: "u1", twoFactorEnabled: false },
	});

	it("doesn't look up the session on allow-listed paths", async () => {
		const getSession = vi.fn(pendingSession);

		await enforceTwoFactorSetupOnAuthPath("/two-factor/enable", getSession);

		expect(getSession).not.toHaveBeenCalled();
	});

	it("lets requests without a session through", async () => {
		await expect(
			enforceTwoFactorSetupOnAuthPath("/sign-in/email", async () => null),
		).resolves.toBeUndefined();
	});

	it("rejects a pending user off the allow-list", async () => {
		withPassword();
		memberships = [membership("u1", { org: true })];

		await expect(
			enforceTwoFactorSetupOnAuthPath(
				"/organization/set-active",
				pendingSession,
			),
		).rejects.toMatchObject({ statusCode: 403 });
	});

	it("refuses /two-factor/disable while a membership requires 2FA", async () => {
		memberships = [membership("u1", { member: true })];

		await expect(
			enforceTwoFactorSetupOnAuthPath("/two-factor/disable", async () => ({
				user: { id: "u1", twoFactorEnabled: true },
			})),
		).rejects.toMatchObject({ statusCode: 403 });
	});

	it("allows /two-factor/disable when nothing requires 2FA", async () => {
		await expect(
			enforceTwoFactorSetupOnAuthPath("/two-factor/disable", async () => ({
				user: { id: "u1", twoFactorEnabled: true },
			})),
		).resolves.toBeUndefined();
	});
});

describe("applyInvitationTwoFactorRequirementOrRevert", () => {
	const acceptedMember = { id: "m1", userId: "u1", organizationId: "org-1" };

	it("doesn't revert when the flag is copied", async () => {
		invitationRow = { require2FA: true };

		await applyInvitationTwoFactorRequirementOrRevert({
			invitationId: "inv-1",
			member: acceptedMember,
		});

		expect(memberUpdateSet).toHaveBeenCalledWith({ require2FA: true });
		expect(txDelete).not.toHaveBeenCalled();
	});

	it("reverts the acceptance and rethrows when the copy fails", async () => {
		invitationRow = { require2FA: true };
		const failure = new Error("db down");
		memberUpdateSet.mockImplementationOnce(() => {
			throw failure;
		});
		vi.spyOn(console, "error").mockImplementationOnce(() => undefined);

		await expect(
			applyInvitationTwoFactorRequirementOrRevert({
				invitationId: "inv-1",
				member: acceptedMember,
			}),
		).rejects.toBe(failure);

		expect(txDelete).toHaveBeenCalledWith(memberTable);
		expect(txUpdateSet).toHaveBeenCalledWith({ status: "pending" });
	});
});
