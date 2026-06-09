import { TRPCClientError } from "@trpc/client";

const PUBLIC_PATH_PREFIXES = ["/register", "/invitation"];

/**
 * Returns true when the given error is a tRPC client error whose underlying
 * response carried an UNAUTHORIZED code (i.e. the session is invalid/expired).
 */
export const isUnauthorizedError = (error: unknown): boolean => {
	if (!(error instanceof TRPCClientError)) return false;
	return (error.data as { code?: string } | null | undefined)?.code ===
		"UNAUTHORIZED";
};

/**
 * Decides whether an auth error should trigger a redirect to the login screen.
 * Public/unauthenticated pages (login, register, invitation) never redirect,
 * and only genuine UNAUTHORIZED errors qualify.
 */
export const shouldRedirectOnAuthError = (
	pathname: string,
	error: unknown,
): boolean => {
	if (!isUnauthorizedError(error)) return false;
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
