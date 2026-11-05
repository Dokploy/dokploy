import {
	deleteHubSpotContactByEmail,
	deleteUserAccountData,
	findUserById,
	IS_CLOUD,
} from "@dokploy/server";
import { cancelStripeSubscriptions } from "./billing";

export const deleteAccount = async (
	userId: string,
	requestedBy: string,
	options?: { requestedAt?: Date | null },
) => {
	const target = await findUserById(userId);
	const startedAt = new Date().toISOString();

	const stripe =
		IS_CLOUD && target.stripeCustomerId
			? {
					customerId: target.stripeCustomerId,
					...(await cancelStripeSubscriptions(target.stripeCustomerId)),
				}
			: null;

	const { organizationsDeleted } = await deleteUserAccountData(userId);

	const hubspot = IS_CLOUD
		? await deleteHubSpotContactByEmail(target.email)
		: "skipped";

	const record = {
		userId,
		email: target.email,
		requestedBy,
		requestedAt: options?.requestedAt?.toISOString() ?? startedAt,
		startedAt,
		completedAt: new Date().toISOString(),
		organizationsDeleted,
		stripe,
		hubspot,
	};

	return record;
};
