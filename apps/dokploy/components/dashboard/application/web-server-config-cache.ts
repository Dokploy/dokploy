type ConfigCacheUtils = {
	application: {
		readTraefikConfig: {
			invalidate(input: { applicationId: string }): Promise<unknown> | unknown;
		};
		readWebServerConfig: {
			invalidate(input: { applicationId: string }): Promise<unknown> | unknown;
		};
	};
};

export const invalidateApplicationWebServerConfig = async (
	utils: ConfigCacheUtils,
	applicationId: string,
) => {
	const input = { applicationId };
	await Promise.all([
		utils.application.readTraefikConfig.invalidate(input),
		utils.application.readWebServerConfig.invalidate(input),
	]);
};
