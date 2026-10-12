export interface DokployResourceMetadata {
	organizationId: string;
	projectId: string;
	projectName: string;
	environmentId: string;
	environmentName: string;
	applicationId: string;
	applicationName: string;
	serviceName?: string;
}

export const DOKPLOY_LABEL_PREFIX = "dokploy";

export const buildDokployLabels = (
	metadata: DokployResourceMetadata,
): Record<string, string> => ({
	[`${DOKPLOY_LABEL_PREFIX}.organization.id`]: metadata.organizationId,
	[`${DOKPLOY_LABEL_PREFIX}.project.id`]: metadata.projectId,
	[`${DOKPLOY_LABEL_PREFIX}.project`]: metadata.projectName,
	[`${DOKPLOY_LABEL_PREFIX}.environment.id`]: metadata.environmentId,
	[`${DOKPLOY_LABEL_PREFIX}.environment`]: metadata.environmentName,
	[`${DOKPLOY_LABEL_PREFIX}.application.id`]: metadata.applicationId,
	[`${DOKPLOY_LABEL_PREFIX}.application`]: metadata.applicationName,
	...(metadata.serviceName
		? { [`${DOKPLOY_LABEL_PREFIX}.service`]: metadata.serviceName }
		: {}),
});

export const dokployLabelsAsList = (
	metadata: DokployResourceMetadata,
): string[] =>
	Object.entries(buildDokployLabels(metadata)).map(
		([key, value]) => `${key}=${value}`,
	);
