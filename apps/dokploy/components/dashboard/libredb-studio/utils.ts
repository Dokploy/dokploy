import {
	INVALID_HOSTNAME_MESSAGE,
	VALID_HOSTNAME_REGEX,
} from "@dokploy/server/utils/hostname-validation";

export const LOCAL_SERVER_VALUE = "dokploy";

export const PLAIN_HTTP_WARNING =
	"The generated address uses plain HTTP, so your Studio session cookie travels unencrypted; use a custom domain with HTTPS for anything beyond a trusted network.";

export const STUDIO_ACCESS_WARNING =
	"Anyone who can open this Studio can use every database in this environment with the stored credentials.";

export const NO_SERVER_IP_MESSAGE =
	"This server has no IP address to build a generated domain from. Use a custom domain.";

export type StudioStatus = "idle" | "running" | "done" | "error";

export type StudioDatabaseType =
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "libsql";

export type StudioDomainKind = "generated" | "custom";

export type StudioDomainInput =
	| { kind: "generated" }
	| { kind: "custom"; host: string };

export const canSetUpLibreDBStudio = (input: {
	isCloud: boolean | undefined;
	canCreateServices: boolean | undefined;
	canCreateDeployments: boolean | undefined;
}): boolean =>
	input.isCloud === false &&
	input.canCreateServices === true &&
	input.canCreateDeployments === true;

export const resolveSelectedServerId = (
	value: string | null | undefined,
	localServerAllowed: boolean,
): string | null | undefined => {
	if (value && value !== LOCAL_SERVER_VALUE) {
		return value;
	}
	return localServerAllowed ? null : undefined;
};

export const findStudioForServer = <T extends { serverId: string | null }>(
	studios: readonly T[] | undefined,
	serverId: string | null,
): T | undefined => studios?.find((studio) => studio.serverId === serverId);

export const getStudioServiceHref = (studio: {
	projectId: string;
	environmentId: string;
	applicationId: string;
}): string =>
	`/dashboard/project/${studio.projectId}/environment/${studio.environmentId}/services/application/${studio.applicationId}`;

export const isGeneratedDomainAvailable = (
	serverIp: string | null | undefined,
): boolean => !!serverIp && serverIp.trim() !== "";

export const getCustomHostError = (host: string): string | null => {
	const trimmed = host.trim();
	if (trimmed === "") {
		return "Enter the domain the Studio should answer on.";
	}
	if (!VALID_HOSTNAME_REGEX.test(trimmed)) {
		return INVALID_HOSTNAME_MESSAGE;
	}
	return null;
};

export const buildStudioDomainInput = (
	kind: StudioDomainKind,
	host: string,
): StudioDomainInput =>
	kind === "custom"
		? { kind: "custom", host: host.trim() }
		: { kind: "generated" };
