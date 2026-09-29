import { SESSION_EXPIRED_MESSAGE } from "@/server/api/auth-constants";
import { TRPCClientError } from "@trpc/client";

const PUBLIC_PATH_PREFIXES = [
	"/register",
	"/invitation",
	"/accept-invitation",
	"/reset-password",
	"/send-reset-password",
];

/**
 * Returns true only for the specific UNAUTHORIZED error that means the session
 * is missing/expired (tagged server-side with SESSION_EXPIRED_MESSAGE).
 *
 * This is deliberately NOT every UNAUTHORIZED error: the API reuses the
 * UNAUTHORIZED code for authenticated users who lack a role or resource
 * permission. Redirecting those to login would yank logged-in users off their
 * page on any permission denial, so we match the sentinel message instead.
 */
export const isSessionExpiredError = (error: unknown): boolean => {
	if (!(error instanceof TRPCClientError)) return false;
	const code = (error.data as { code?: string } | null | undefined)?.code;
	return code === "UNAUTHORIZED" && error.message === SESSION_EXPIRED_MESSAGE;
};

/**
 * Decides whether an auth error should trigger a redirect to the login screen.
 * Public/unauthenticated pages never redirect, and only a genuine expired
 * session (not a permission denial) qualifies.
 */
export const shouldRedirectOnAuthError = (
	pathname: string,
	error: unknown,
): boolean => {
	if (!isSessionExpiredError(error)) return false;
	if (pathname === "/") return false;
	if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
		return false;
	return true;
};

let isRedirecting = false;

/**
 * Side-effecting handler wired into the global tRPC query/mutation caches.
 * Redirects the browser to the login screen exactly once when an expired
 * session is detected on a protected page.
 */
export const handleAuthError = (error: unknown): void => {
	if (typeof window === "undefined") return;
	if (isRedirecting) return;
	if (!shouldRedirectOnAuthError(window.location.pathname, error)) return;

	isRedirecting = true;
	window.location.href = "/";
};
