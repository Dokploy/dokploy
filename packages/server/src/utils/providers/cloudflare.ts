/**
 * Minimal Cloudflare API client.
 *
 * Uses the native `fetch` available in Node 18+, so no extra dependency is
 * required. Only the calls needed for the integration credential layer live
 * here today (token + account verification); tunnel/DNS/Access helpers are
 * layered on in later iterations.
 *
 * The caller's API token is sent as a bearer credential and is never logged or
 * included in thrown error messages.
 */

export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

export interface CloudflareApiErrorDetail {
	code: number;
	message: string;
}

export interface CloudflareApiResponse<T> {
	success: boolean;
	errors: CloudflareApiErrorDetail[];
	messages: unknown[];
	result: T;
}

/**
 * Error thrown for any non-successful Cloudflare API response. The message is
 * derived from Cloudflare's structured `errors` array and never includes the
 * caller's API token.
 */
export class CloudflareApiError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CloudflareApiError";
	}
}

const buildErrorMessage = (
	status: number,
	errors: CloudflareApiErrorDetail[] | undefined,
): string => {
	const first = errors?.[0];
	if (first?.message) {
		return first.message;
	}
	return `Cloudflare API request failed (HTTP ${status})`;
};

/**
 * Performs an authenticated request against the Cloudflare v4 API and unwraps
 * the standard `{ success, errors, result }` envelope. Throws a
 * {@link CloudflareApiError} on transport failure or `success: false`.
 */
export const cloudflareRequest = async <T>(
	apiToken: string,
	path: string,
	init?: RequestInit,
): Promise<T> => {
	const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
			...init?.headers,
		},
	});

	let body: CloudflareApiResponse<T> | undefined;
	try {
		body = (await response.json()) as CloudflareApiResponse<T>;
	} catch {
		body = undefined;
	}

	if (!response.ok || !body?.success) {
		throw new CloudflareApiError(
			buildErrorMessage(response.status, body?.errors),
		);
	}

	return body.result;
};

export interface CloudflareTokenStatus {
	id: string;
	status: string;
}

/**
 * Verifies an API token via `GET /user/tokens/verify`. Throws if the token is
 * invalid or not in the `active` state.
 */
export const verifyToken = async (
	apiToken: string,
): Promise<CloudflareTokenStatus> => {
	const result = await cloudflareRequest<CloudflareTokenStatus>(
		apiToken,
		"/user/tokens/verify",
	);
	if (result.status !== "active") {
		throw new CloudflareApiError(
			`Cloudflare API token is not active (status: ${result.status})`,
		);
	}
	return result;
};
