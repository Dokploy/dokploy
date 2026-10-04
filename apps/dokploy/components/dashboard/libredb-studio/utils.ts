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

export const DATABASE_NOT_RUNNING_REASON = "Deploy or start the database first";

export const STUDIO_NOT_RUNNING_REASON = "The Studio is not running";

export const DATABASE_NOT_COVERED_REASON =
	"The LibreDB Studio of this environment does not cover this database.";

export const POPUP_BLOCKED_MESSAGE =
	"Your browser blocked the new tab. Allow pop-ups for this site and try again.";

export const INVALID_LAUNCH_URL_MESSAGE =
	"The launch address is not an http or https URL.";

export interface StudioForDatabase {
	studio: {
		libredbStudioId: string;
		serverId: string | null;
		applicationStatus: StudioStatus;
	} | null;
	seedId: string;
	covered: boolean;
	reason: string | null;
	canInstall: boolean;
	databaseStatus: StudioStatus;
	environmentId: string;
	serverId: string | null;
}

export type OpenInStudioState =
	| { kind: "hidden" }
	| { kind: "setup"; environmentId: string; serverId: string | null }
	| { kind: "disabled"; reason: string }
	| { kind: "ready"; libredbStudioId: string; connectionId: string };

export const getOpenInStudioState = (
	data: StudioForDatabase | undefined,
	errorMessage?: string,
): OpenInStudioState => {
	if (!data) {
		return errorMessage
			? { kind: "disabled", reason: errorMessage }
			: { kind: "hidden" };
	}
	const { studio } = data;
	if (studio && data.covered) {
		if (data.databaseStatus === "idle") {
			return { kind: "disabled", reason: DATABASE_NOT_RUNNING_REASON };
		}
		if (studio.applicationStatus !== "done") {
			return { kind: "disabled", reason: STUDIO_NOT_RUNNING_REASON };
		}
		return {
			kind: "ready",
			libredbStudioId: studio.libredbStudioId,
			connectionId: data.seedId,
		};
	}
	if (data.canInstall && studio === null) {
		return {
			kind: "setup",
			environmentId: data.environmentId,
			serverId: data.serverId,
		};
	}
	if (data.reason) {
		return { kind: "disabled", reason: data.reason };
	}
	if (studio) {
		return { kind: "disabled", reason: DATABASE_NOT_COVERED_REASON };
	}
	return { kind: "hidden" };
};

export interface LaunchTab {
	opener: unknown;
	location: { replace: (url: string) => void };
	close: () => void;
}

export const openLaunchTab = (opener: {
	open: (url: string, target: string) => LaunchTab | null;
}): LaunchTab | null => opener.open("about:blank", "_blank");

// The launch tab starts as about:blank, which shares Dokploy's origin, so a javascript: or data: address would run with Dokploy's privileges.
export const assertLaunchUrl = (url: string): string => {
	let protocol: string;
	try {
		protocol = new URL(url).protocol;
	} catch {
		throw new Error(INVALID_LAUNCH_URL_MESSAGE);
	}
	if (protocol !== "https:" && protocol !== "http:") {
		throw new Error(INVALID_LAUNCH_URL_MESSAGE);
	}
	return url;
};

// window.open with noopener returns no handle to navigate later, so the opener is cut by hand before Studio loads.
export const navigateLaunchTab = (tab: LaunchTab, url: string): void => {
	const launchUrl = assertLaunchUrl(url);
	tab.opener = null;
	tab.location.replace(launchUrl);
};

export const CUSTOM_CONNECTIONS_WARNING =
	"Allowing custom connections lets Studio users connect to any host this server can reach, including Dokploy's own database.";

export const STUDIO_REVOCATION_WARNING =
	"Removing someone's access in Dokploy does not end a Studio session they already opened, which lasts up to 24 hours; disable their Studio account to cut it at once.";

export const COOKIE_SETTING_WARNING =
	"Domain scheme changed: apply the cookie setting";

export const HTTP_ADDRESS_WARNING =
	"This address uses plain HTTP, so your Studio session cookie travels unencrypted; use a domain with HTTPS for anything beyond a trusted network.";

export const STUDIO_NO_DOMAIN_REASON =
	"The Studio has no domain. Add one in the Domains tab.";

export const getStudioStatusLabel = (status: StudioStatus): string => {
	switch (status) {
		case "done":
			return "Deployed";
		case "running":
			return "Deploying";
		case "error":
			return "Deploy failed";
		case "idle":
			return "Stopped or not deployed";
	}
};

export const getStudioOpenBlocker = (studio: {
	applicationStatus: StudioStatus;
	url: string | null;
}): string | null => {
	if (studio.applicationStatus !== "done") {
		return STUDIO_NOT_RUNNING_REASON;
	}
	if (!studio.url) {
		return STUDIO_NO_DOMAIN_REASON;
	}
	return null;
};

export const getStudioImageTag = (image: string): string => {
	const digestIndex = image.indexOf("@");
	if (digestIndex !== -1) {
		return image.slice(digestIndex + 1);
	}
	const tagIndex = image.lastIndexOf(":");
	return tagIndex > image.lastIndexOf("/") ? image.slice(tagIndex + 1) : image;
};

export const getSyncResultMessage = (result: {
	changed: boolean;
	networksChanged: boolean;
}): string => {
	const seed = result.changed
		? "Seed file updated."
		: "Seed file was already up to date.";
	return result.networksChanged
		? `${seed} The Studio networks changed, and the running Studio was updated with them.`
		: seed;
};

export const getDatabaseHref = (
	studio: { projectId: string; environmentId: string },
	database: { kind: StudioDatabaseType; id: string },
): string =>
	`/dashboard/project/${studio.projectId}/environment/${studio.environmentId}/services/${database.kind}/${database.id}`;
