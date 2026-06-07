export type PasskeyFlow = "sign-in" | "register";

export type PasskeyError = {
	code?: string;
	message?: string;
};

const CEREMONY_BUSY_MESSAGE =
	"A passkey operation is already in progress. Wait for the device prompt to finish.";

let inFlight = false;
let conditionalSessionId = 0;

export function beginConditionalPasskeySession(): number {
	conditionalSessionId += 1;
	return conditionalSessionId;
}

export function isConditionalPasskeySessionStale(sessionId: number): boolean {
	return sessionId !== conditionalSessionId;
}

export function endConditionalPasskeySession(sessionId: number): void {
	if (sessionId === conditionalSessionId) {
		conditionalSessionId += 1;
	}
}

export class PasskeyCeremonyBusyError extends Error {
	constructor() {
		super(CEREMONY_BUSY_MESSAGE);
		this.name = "PasskeyCeremonyBusyError";
	}
}

export function isPasskeyCeremonyInFlight(): boolean {
	return inFlight;
}

export async function waitForPasskeyCeremonyIdle(
	timeoutMs = 200,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (inFlight && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

export async function runPasskeyCeremony<T>(fn: () => Promise<T>): Promise<T> {
	if (inFlight) {
		throw new PasskeyCeremonyBusyError();
	}
	inFlight = true;
	try {
		return await fn();
	} finally {
		inFlight = false;
	}
}

export function isPasskeyCeremonyAbort(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return (
		err.name === "AbortError" ||
		err.message.includes("abort signal") ||
		err.message.includes("Cancelling existing WebAuthn")
	);
}

export function isPasskeyNotAllowed(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return (
		err.name === "NotAllowedError" ||
		err.message.includes("timed out or was not allowed")
	);
}

export function isPasskeySecurityError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return (
		err.name === "SecurityError" ||
		err.message.includes("SecurityError") ||
		err.message.includes("not allowed by the user agent")
	);
}

export function getPasskeyOriginPreflightError(): string | null {
	if (typeof window === "undefined") return null;

	const browserOrigin = window.location.origin;
	const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

	if (configuredUrl) {
		const expectedOrigin = configuredUrl.replace(/\/$/, "");
		if (browserOrigin === expectedOrigin) return null;

		try {
			const expected = new URL(expectedOrigin);
			const actual = new URL(browserOrigin);

			if (expected.hostname === "localhost" && actual.hostname === "127.0.0.1") {
				return `Use ${expectedOrigin} — not ${browserOrigin} (WebAuthn rpID is tied to localhost in dev).`;
			}
			if (expected.hostname === "127.0.0.1" && actual.hostname === "localhost") {
				return `Use ${expectedOrigin} — not ${browserOrigin} (origins must match exactly).`;
			}

			return `Use ${expectedOrigin} to sign in — you are on ${browserOrigin}. See passkey setup docs for origin alignment.`;
		} catch {
			return "Passkey origin is misconfigured. Check NEXT_PUBLIC_APP_URL matches your browser URL.";
		}
	}

	if (process.env.NODE_ENV === "development") {
		if (window.location.hostname !== "localhost") {
			const port = window.location.port || "3000";
			return `Use http://localhost:${port} — not ${window.location.host} (WebAuthn rpID is tied to localhost in dev).`;
		}
	}

	return null;
}

export function getPasskeyErrorMessage({
	error,
	caught,
	flow,
}: {
	error: PasskeyError;
	caught?: unknown;
	flow: PasskeyFlow;
}): string {
	if (caught instanceof PasskeyCeremonyBusyError) {
		return CEREMONY_BUSY_MESSAGE;
	}

	if (caught && isPasskeyCeremonyAbort(caught)) {
		return flow === "register"
			? "Passkey registration was cancelled."
			: "Passkey sign-in was cancelled. Try again or use email and password.";
	}

	switch (error.code) {
		case "AUTH_CANCELLED":
		case "ERROR_CEREMONY_ABORTED":
			return flow === "register"
				? "Passkey registration was cancelled."
				: "Passkey sign-in was cancelled. Try again or use email and password.";
		case "PASSKEY_NOT_FOUND":
			return "No passkey registered yet. Sign in with email and password, then add one in Settings → Profile.";
		case "AUTHENTICATION_FAILED":
			return "Passkey verification failed. Try again or use email and password.";
		case "CHALLENGE_NOT_FOUND":
			return flow === "register"
				? "Passkey session expired. Close this dialog and try again."
				: "Passkey session expired. Refresh the page and try again.";
		case "SESSION_NOT_FRESH":
			return "Your session expired. Sign out, sign in again, then add a passkey.";
		case "INVALID_ORIGIN":
			return "Origin mismatch. Use the same URL configured in BETTER_AUTH_URL. See passkey setup docs for origin alignment.";
		case "EMAIL_NOT_VERIFIED":
			return "Your email is not verified. We've sent a new verification link to your email.";
		default:
			if (caught && isPasskeyNotAllowed(caught)) {
				return flow === "register"
					? "Passkey registration timed out or was denied. Complete the device prompt when it appears."
					: "No passkey registered yet. Sign in with email and password, then add one in Settings → Profile.";
			}
			if (caught && isPasskeySecurityError(caught)) {
				return "Passkey is not available on this page. Check that you are using HTTPS (or localhost in dev) and the correct site URL.";
			}
			if (
				error.message?.toLowerCase().includes("timeout") ||
				(caught instanceof Error &&
					caught.message.toLowerCase().includes("timeout"))
			) {
				return flow === "register"
					? "Passkey registration timed out. Use http://localhost:3000 (not 127.0.0.1 or your LAN IP), complete Touch ID when prompted, and try again."
					: "Passkey sign-in timed out. Try again or use email and password.";
			}
			if (
				error.message?.toLowerCase().includes("origin") ||
				error.message?.toLowerCase().includes("forbidden")
			) {
				return "Origin mismatch. Use the same URL configured in BETTER_AUTH_URL. See passkey setup docs for origin alignment.";
			}
			if (error.message && error.message !== "auth cancelled") {
				return error.message;
			}
			return flow === "register"
				? "Failed to register passkey"
				: "Passkey sign-in failed. Try again or use email and password.";
	}
}
