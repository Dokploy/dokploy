export type AutoValidationDomain = {
	host: string;
	enabled?: boolean;
};

export const getHostsToAutoValidate = (
	domains: readonly AutoValidationDomain[],
	validatedHosts: ReadonlySet<string>,
) =>
	domains
		.filter(
			(domain) => domain.enabled !== false && !validatedHosts.has(domain.host),
		)
		.map((domain) => domain.host);

export const isCurrentValidation = ({
	currentScopeRequestId,
	currentHostRequestId,
	hostRequestId,
	scopeRequestId,
}: {
	currentScopeRequestId: number;
	currentHostRequestId: number | undefined;
	hostRequestId: number;
	scopeRequestId: number;
}) =>
	currentScopeRequestId === scopeRequestId &&
	currentHostRequestId === hostRequestId;

export const didServerIpChange = (
	previousServerIp: string | undefined,
	serverIp: string | undefined,
) => previousServerIp !== serverIp;
