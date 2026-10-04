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

export const ADD_DATABASE_STUDIO_NOTE =
	"This database will appear in LibreDB Studio automatically and can be opened there once it is deployed.";

export const ADD_DATABASE_STUDIO_SWITCH_LABEL =
	"Also set up LibreDB Studio for this environment";

export const ADD_DATABASE_NO_IP_MESSAGE =
	"This server has no IP address to build a generated domain from. Install LibreDB Studio with a custom domain from the Create Service menu instead.";

export type AddDatabaseStudioSection =
	| { kind: "none" }
	| { kind: "error"; message: string }
	| { kind: "note" }
	| { kind: "switch" };

export const getAddDatabaseStudioSection = (input: {
	isCloud: boolean | undefined;
	canSetUp: boolean;
	serverId: string | null | undefined;
	studios: readonly { serverId: string | null }[] | undefined;
	errorMessage: string | undefined;
}): AddDatabaseStudioSection => {
	if (input.isCloud !== false || input.serverId === undefined) {
		return { kind: "none" };
	}
	if (input.errorMessage) {
		return { kind: "error", message: input.errorMessage };
	}
	if (!input.studios) {
		return { kind: "none" };
	}
	if (findStudioForServer(input.studios, input.serverId)) {
		return { kind: "note" };
	}
	return input.canSetUp ? { kind: "switch" } : { kind: "none" };
};

const ADD_DATABASE_STUDIO_DESCRIPTION = `Installs LibreDB Studio on a generated address after the database is created. ${PLAIN_HTTP_WARNING}`;

export const getAddDatabaseStudioSwitch = (input: {
	serverIp: string | null | undefined;
	errorMessage: string | undefined;
}): { available: boolean; description: string } => {
	if (input.errorMessage) {
		return {
			available: false,
			description: `The IP address of this server could not be checked: ${input.errorMessage}`,
		};
	}
	if (input.serverIp === undefined) {
		return { available: false, description: ADD_DATABASE_STUDIO_DESCRIPTION };
	}
	if (!isGeneratedDomainAvailable(input.serverIp)) {
		return { available: false, description: ADD_DATABASE_NO_IP_MESSAGE };
	}
	return { available: true, description: ADD_DATABASE_STUDIO_DESCRIPTION };
};
