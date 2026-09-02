export type SavedApplicationEnvironment = {
	env: string;
	buildArgs: string;
	buildSecrets: string;
	createEnvFile: boolean;
};

export const mergeSavedApplicationEnvironment = <T extends object>(
	application: T | undefined,
	environment: SavedApplicationEnvironment,
) => {
	if (!application) {
		return application;
	}

	return {
		...application,
		...environment,
	};
};

export const isSavedApplicationEnvironment = (
	application: Partial<
		Record<keyof SavedApplicationEnvironment, string | boolean | null>
	>,
	environment: SavedApplicationEnvironment,
) =>
	application.env === environment.env &&
	application.buildArgs === environment.buildArgs &&
	application.buildSecrets === environment.buildSecrets &&
	application.createEnvFile === environment.createEnvFile;
