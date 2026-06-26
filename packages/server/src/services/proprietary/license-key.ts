import { db } from "@dokploy/server/db";
import { member, user } from "@dokploy/server/db/schema";
import { asc, eq } from "drizzle-orm";
import { getOrganizationOwnerId } from "./sso";

/**
 * Instance-wide enterprise check for contexts without an organization
 * (unauthenticated pages, _document, public endpoints). Returns true only when
 * the instance owner has enterprise features enabled AND a valid license.
 * When false, all enterprise features (whitelabeling, SSO, restrictions) must
 * be treated as off.
 */
export const hasValidLicenseForInstance = async () => {
	const owner = await db.query.member.findFirst({
		where: eq(member.role, "owner"),
		with: {
			user: {
				columns: {
					enableEnterpriseFeatures: true,
					isValidEnterpriseLicense: true,
				},
			},
		},
		orderBy: [asc(member.createdAt)],
	});

	if (!owner) {
		return false;
	}

	return !!(
		owner.user.enableEnterpriseFeatures && owner.user.isValidEnterpriseLicense
	);
};

export const hasValidLicense = async (organizationId: string) => {
	const ownerId = await getOrganizationOwnerId(organizationId);

	if (!ownerId) {
		return false;
	}

	const currentUser = await db.query.user.findFirst({
		where: eq(user.id, ownerId),
		columns: {
			enableEnterpriseFeatures: true,
			isValidEnterpriseLicense: true,
		},
	});
	return !!(
		currentUser?.enableEnterpriseFeatures &&
		currentUser?.isValidEnterpriseLicense
	);
};
