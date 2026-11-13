import { db } from "@dokploy/server/db";
import { account, organization } from "@dokploy/server/db/schema";
import { and, eq } from "drizzle-orm";

export const hasPasswordAccount = async (userId: string) => {
	const credential = await db.query.account.findFirst({
		where: and(
			eq(account.userId, userId),
			eq(account.providerId, "credential"),
		),
		columns: { id: true },
	});
	return !!credential;
};

// Users without a password sign in through SSO/social providers, which own their MFA,
// and better-auth can't enable 2FA for them without a password anyway
export const requiresTwoFactorSetup = async (
	user: { id: string; twoFactorEnabled?: boolean | null },
	org: { enforceTwoFactor: boolean } | null | undefined,
) => {
	if (!org?.enforceTwoFactor || user.twoFactorEnabled) return false;
	return hasPasswordAccount(user.id);
};

export const updateOrganizationEnforceTwoFactor = async (
	organizationId: string,
	enforceTwoFactor: boolean,
) => {
	const [updated] = await db
		.update(organization)
		.set({ enforceTwoFactor })
		.where(eq(organization.id, organizationId))
		.returning();
	return updated;
};
