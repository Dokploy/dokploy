import { createHmac, timingSafeEqual } from "node:crypto";
import { betterAuthSecret } from "../../lib/auth-secret";

const OAUTH_STATE_VERSION = 1;
const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type GitProviderOAuthProviderType = "gitlab" | "gitea" | "github-app";

export const GITHUB_APP_INIT_STATE_PROVIDER_ID = "gh_init";
const GITHUB_APP_SETUP_STATE_PROVIDER_PREFIX = "gh_setup:";

export const buildGithubAppSetupStateProviderId = (githubId: string) =>
	`${GITHUB_APP_SETUP_STATE_PROVIDER_PREFIX}${githubId}`;

export const getGithubIdFromAppSetupStateProviderId = (providerId: string) =>
	providerId.startsWith(GITHUB_APP_SETUP_STATE_PROVIDER_PREFIX)
		? providerId.slice(GITHUB_APP_SETUP_STATE_PROVIDER_PREFIX.length)
		: null;

type GitProviderOAuthStateInput = {
	providerType: GitProviderOAuthProviderType;
	providerId: string;
	redirectUri: string;
	sessionId: string;
	userId: string;
	organizationId: string;
	now?: number;
	ttlMs?: number;
};

type GitProviderOAuthStateExpected = {
	providerType: GitProviderOAuthProviderType;
	providerId?: string;
	redirectUri?: string;
	sessionId: string;
	userId: string;
	organizationId: string;
	now?: number;
};

export type GitProviderOAuthStatePayload = {
	v: typeof OAUTH_STATE_VERSION;
	providerType: GitProviderOAuthProviderType;
	providerId: string;
	redirectUri: string;
	sessionId: string;
	userId: string;
	organizationId: string;
	iat: number;
	exp: number;
};

type GitProviderOAuthManageSession = {
	activeOrganizationId?: string | null;
	userId?: string | null;
};

type GitProviderOAuthManageUser = {
	role?: string | null;
};

type GitProviderOAuthManageProvider = {
	gitProvider: {
		organizationId: string;
		userId: string;
	};
};

const encodeBase64Url = (value: string) =>
	Buffer.from(value, "utf8").toString("base64url");

const decodeBase64Url = (value: string) =>
	Buffer.from(value, "base64url").toString("utf8");

const signPayload = (payload: string) =>
	createHmac("sha256", betterAuthSecret).update(payload).digest("base64url");

const constantTimeEqual = (left: string, right: string) => {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return (
		leftBuffer.length === rightBuffer.length &&
		timingSafeEqual(leftBuffer, rightBuffer)
	);
};

export const signGitProviderOAuthState = ({
	providerType,
	providerId,
	redirectUri,
	sessionId,
	userId,
	organizationId,
	now = Date.now(),
	ttlMs = DEFAULT_TTL_MS,
}: GitProviderOAuthStateInput) => {
	const payload: GitProviderOAuthStatePayload = {
		v: OAUTH_STATE_VERSION,
		providerType,
		providerId,
		redirectUri,
		sessionId,
		userId,
		organizationId,
		iat: now,
		exp: now + ttlMs,
	};
	const encodedPayload = encodeBase64Url(JSON.stringify(payload));
	return `${encodedPayload}.${signPayload(encodedPayload)}`;
};

export const verifyGitProviderOAuthState = (
	state: string,
	expected: GitProviderOAuthStateExpected,
): GitProviderOAuthStatePayload => {
	const [encodedPayload, signature, extra] = state.split(".");
	if (!encodedPayload || !signature || extra !== undefined) {
		throw new Error("Invalid OAuth state");
	}

	if (!constantTimeEqual(signature, signPayload(encodedPayload))) {
		throw new Error("Invalid OAuth state");
	}

	let payload: GitProviderOAuthStatePayload;
	try {
		payload = JSON.parse(decodeBase64Url(encodedPayload));
	} catch {
		throw new Error("Invalid OAuth state");
	}

	const now = expected.now ?? Date.now();
	if (
		payload.v !== OAUTH_STATE_VERSION ||
		payload.providerType !== expected.providerType ||
		(expected.providerId !== undefined &&
			payload.providerId !== expected.providerId) ||
		(expected.redirectUri !== undefined &&
			payload.redirectUri !== expected.redirectUri) ||
		payload.sessionId !== expected.sessionId ||
		payload.userId !== expected.userId ||
		payload.organizationId !== expected.organizationId ||
		!Number.isSafeInteger(payload.iat) ||
		!Number.isSafeInteger(payload.exp) ||
		payload.exp < now
	) {
		throw new Error("Invalid OAuth state");
	}

	return payload;
};

export const canManageGitProviderOAuth = (
	provider: GitProviderOAuthManageProvider,
	session: GitProviderOAuthManageSession,
	user: GitProviderOAuthManageUser,
) => {
	if (
		provider.gitProvider.organizationId !== session.activeOrganizationId ||
		!session.userId
	) {
		return false;
	}

	return (
		provider.gitProvider.userId === session.userId ||
		user.role === "owner" ||
		user.role === "admin"
	);
};
