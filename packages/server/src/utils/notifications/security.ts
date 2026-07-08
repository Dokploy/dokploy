import {
	assertCloudHostResolvesPublic,
	type HostnameLookup,
	isBlockedCloudHost,
} from "@dokploy/server/utils/url/network";

export const REDACTED_NOTIFICATION_SECRET = "__DOKPLOY_REDACTED_SECRET__";

type NormalizeNotificationUrlOptions = {
	allowPrivateNetwork?: boolean;
	fieldName?: string;
};

type AssertNotificationUrlOptions = NormalizeNotificationUrlOptions & {
	lookup?: HostnameLookup;
};

type NotificationRecord = Record<string, unknown>;

const secretFieldsByRelation: Record<string, string[]> = {
	slack: ["webhookUrl"],
	telegram: ["botToken"],
	discord: ["webhookUrl"],
	email: ["password"],
	resend: ["apiKey"],
	gotify: ["appToken"],
	ntfy: ["accessToken"],
	mattermost: ["webhookUrl"],
	custom: ["endpoint"],
	lark: ["webhookUrl"],
	pushover: ["userKey", "apiToken"],
	teams: ["webhookUrl"],
};

const resolveAllowPrivateNetwork = (allowPrivateNetwork: boolean | undefined) =>
	allowPrivateNetwork ?? process.env.IS_CLOUD !== "true";

export const isRedactedNotificationSecret = (value: unknown) =>
	value === REDACTED_NOTIFICATION_SECRET;

export const notificationSecretUpdateValue = (value: unknown) => {
	if (
		typeof value !== "string" ||
		value.trim() === "" ||
		isRedactedNotificationSecret(value)
	) {
		return undefined;
	}

	return value;
};

export const notificationOptionalSecretUpdateValue = (value: unknown) => {
	if (value === undefined) {
		return undefined;
	}
	if (isRedactedNotificationSecret(value)) {
		return undefined;
	}
	if (typeof value === "string" && value.trim() === "") {
		return null;
	}
	if (typeof value !== "string") {
		return undefined;
	}

	return value;
};

const redactSecretValue = (value: unknown) => {
	if (value === null || value === undefined || value === "") {
		return value;
	}

	return REDACTED_NOTIFICATION_SECRET;
};

const redactHeaders = (headers: unknown) => {
	if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
		return headers;
	}

	return Object.fromEntries(
		Object.keys(headers as Record<string, unknown>).map((key) => [
			key,
			REDACTED_NOTIFICATION_SECRET,
		]),
	);
};

export const notificationHeadersUpdateValue = (
	headers: Record<string, string> | undefined,
) => {
	if (!headers) {
		return undefined;
	}

	if (
		Object.values(headers).some((value) => isRedactedNotificationSecret(value))
	) {
		return undefined;
	}

	return headers;
};

export const redactNotificationSecrets = <T extends NotificationRecord>(
	notification: T,
): T => {
	const redactedNotification: NotificationRecord = { ...notification };

	for (const [relation, fields] of Object.entries(secretFieldsByRelation)) {
		const relationValue = notification[relation];
		if (
			!relationValue ||
			typeof relationValue !== "object" ||
			Array.isArray(relationValue)
		) {
			continue;
		}

		const redactedRelation: NotificationRecord = { ...relationValue };
		for (const field of fields) {
			if (field in redactedRelation) {
				redactedRelation[field] = redactSecretValue(redactedRelation[field]);
			}
		}

		if (relation === "custom" && "headers" in redactedRelation) {
			redactedRelation.headers = redactHeaders(redactedRelation.headers);
		}

		redactedNotification[relation] = redactedRelation;
	}

	return redactedNotification as T;
};

export const redactNotificationSecretsList = <T extends NotificationRecord>(
	notifications: T[],
) =>
	notifications.map((notification) => redactNotificationSecrets(notification));

const parseNotificationUrl = (urlValue: string, fieldName: string) => {
	try {
		return new URL(urlValue);
	} catch {
		throw new Error(`${fieldName} must be a valid notification URL`);
	}
};

export const normalizeNotificationHttpUrl = (
	urlValue: string,
	options: NormalizeNotificationUrlOptions = {},
) => {
	const fieldName = options.fieldName ?? "Notification URL";
	const allowPrivateNetwork = resolveAllowPrivateNetwork(
		options.allowPrivateNetwork,
	);
	const url = parseNotificationUrl(urlValue, fieldName);

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`${fieldName} must use http or https`);
	}

	if (!allowPrivateNetwork && url.protocol !== "https:") {
		throw new Error(`${fieldName} must use https in cloud deployments`);
	}

	if (url.username || url.password) {
		throw new Error(`${fieldName} must not include credentials`);
	}

	if (url.hash) {
		throw new Error(`${fieldName} must not include fragment data`);
	}

	if (!allowPrivateNetwork && isBlockedCloudHost(url.hostname)) {
		throw new Error(`${fieldName} host is not allowed in cloud deployments`);
	}

	return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
};

export const assertNotificationHttpUrlAllowed = async (
	urlValue: string,
	options: AssertNotificationUrlOptions = {},
) => {
	const fieldName = options.fieldName ?? "Notification URL";
	const allowPrivateNetwork = resolveAllowPrivateNetwork(
		options.allowPrivateNetwork,
	);
	const normalizedUrl = normalizeNotificationHttpUrl(urlValue, {
		...options,
		fieldName,
		allowPrivateNetwork,
	});

	if (!allowPrivateNetwork) {
		await assertCloudHostResolvesPublic(new URL(normalizedUrl).hostname, {
			fieldName,
			lookup: options.lookup,
		});
	}

	return normalizedUrl;
};

export const normalizeNotificationBaseUrl = (
	urlValue: string,
	options: NormalizeNotificationUrlOptions = {},
) => {
	const fieldName = options.fieldName ?? "Notification server URL";
	const normalizedUrl = normalizeNotificationHttpUrl(urlValue, {
		...options,
		fieldName,
	});
	const url = new URL(normalizedUrl);

	if (url.search) {
		throw new Error(`${fieldName} must not include query data`);
	}

	const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");

	return `${url.protocol}//${url.host}${pathname}`;
};

export const assertNotificationBaseUrlAllowed = async (
	urlValue: string,
	options: AssertNotificationUrlOptions = {},
) => {
	const fieldName = options.fieldName ?? "Notification server URL";
	const allowPrivateNetwork = resolveAllowPrivateNetwork(
		options.allowPrivateNetwork,
	);
	const normalizedUrl = normalizeNotificationBaseUrl(urlValue, {
		...options,
		fieldName,
		allowPrivateNetwork,
	});

	if (!allowPrivateNetwork) {
		await assertCloudHostResolvesPublic(new URL(normalizedUrl).hostname, {
			fieldName,
			lookup: options.lookup,
		});
	}

	return normalizedUrl;
};

export const normalizeNotificationSmtpHost = (
	smtpHost: string,
	options: Pick<NormalizeNotificationUrlOptions, "allowPrivateNetwork"> = {},
) => {
	const normalizedHost = smtpHost.trim();
	const allowPrivateNetwork = resolveAllowPrivateNetwork(
		options.allowPrivateNetwork,
	);

	if (!normalizedHost) {
		throw new Error("SMTP host is required");
	}

	if (
		normalizedHost.includes("://") ||
		normalizedHost.includes("/") ||
		normalizedHost.includes("@")
	) {
		throw new Error("SMTP host must be a hostname without protocol or path");
	}

	let parsedHost: string;
	try {
		const parsed = new URL(`http://${normalizedHost}`);
		if (
			parsed.username ||
			parsed.password ||
			parsed.port ||
			parsed.pathname !== "/"
		) {
			throw new Error("invalid SMTP host");
		}
		parsedHost = parsed.hostname;
	} catch {
		throw new Error("SMTP host must be a hostname without protocol or path");
	}

	if (!allowPrivateNetwork && isBlockedCloudHost(parsedHost)) {
		throw new Error("SMTP host is not allowed in cloud deployments");
	}

	return parsedHost;
};

export const assertNotificationSmtpHostAllowed = async (
	smtpHost: string,
	options: Pick<
		AssertNotificationUrlOptions,
		"allowPrivateNetwork" | "lookup"
	> = {},
) => {
	const allowPrivateNetwork = resolveAllowPrivateNetwork(
		options.allowPrivateNetwork,
	);
	const normalizedHost = normalizeNotificationSmtpHost(smtpHost, {
		allowPrivateNetwork,
	});

	if (!allowPrivateNetwork) {
		await assertCloudHostResolvesPublic(normalizedHost, {
			fieldName: "SMTP host",
			lookup: options.lookup,
		});
	}

	return normalizedHost;
};

export const resolveNotificationSmtpTarget = async (
	smtpHost: string,
	options: Pick<
		AssertNotificationUrlOptions,
		"allowPrivateNetwork" | "lookup"
	> = {},
) => {
	const allowPrivateNetwork = resolveAllowPrivateNetwork(
		options.allowPrivateNetwork,
	);
	const normalizedHost = normalizeNotificationSmtpHost(smtpHost, {
		allowPrivateNetwork,
	});

	if (allowPrivateNetwork) {
		return {
			host: normalizedHost,
			servername: normalizedHost,
		};
	}

	const resolvedHost = await assertCloudHostResolvesPublic(normalizedHost, {
		fieldName: "SMTP host",
		lookup: options.lookup,
	});
	const firstAddress = resolvedHost.addresses[0];
	if (!firstAddress) {
		throw new Error("SMTP host could not be resolved");
	}

	return {
		host: firstAddress.address,
		servername: normalizedHost,
	};
};
