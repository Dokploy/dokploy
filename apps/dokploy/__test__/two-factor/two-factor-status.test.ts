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
const memberUpdateSet = vi.fn(() => ({ where: vi.fn(async () => undefined) }));

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
		},
		update: vi.fn(() => ({ set: memberUpdateSet })),
	},
}));

const {
	applyInvitationTwoFactorRequirement,
	assertTwoFactorCanBeDisabled,
	assertTwoFactorSetupComplete,
	getTwoFactorStatuses,
	getUserTwoFactorStatus,
	isTwoFactorRequiredByAnyMembership,
	isTwoFactorSetupAuthPath,
	resolveTwoFactorStatus,
} = await import("@dokploy/server/services/two-factor-policy");

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
