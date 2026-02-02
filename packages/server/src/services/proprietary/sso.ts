import { db } from "@dokploy/server/db";

export const getSSOProviders = async () => {
	const providers = await db.query.ssoProvider.findMany({
		columns: {
			id: true,
			providerId: true,
			issuer: true,
			domain: true,
			oidcConfig: true,
			samlConfig: true,
		},
	});
	return providers;
};
