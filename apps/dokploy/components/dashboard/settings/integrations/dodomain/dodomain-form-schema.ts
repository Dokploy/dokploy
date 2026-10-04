import { z } from "zod";

export const DODOMAIN_DEFAULT_BASE_URL = "https://app.dodomain.io";

export const DODOMAIN_SECRET_KEY_PREFIX_MESSAGE =
	"DoDomain secret keys start with dd_sk_";
export const DODOMAIN_SECRET_KEY_REQUIRED_MESSAGE = "Secret key is required";
export const DODOMAIN_BASE_URL_SECURE_MESSAGE =
	"Use an https URL (http is only allowed for localhost)";

// Mirrors the server rule: the secret key is sent as a bearer token, so only
// https (or http on a loopback host, for local development) is accepted.
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const isSecureBaseUrl = (value: string) => {
	try {
		const url = new URL(value);
		if (url.protocol === "https:") return true;
		return url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
	} catch {
		return false;
	}
};

/**
 * The root of the DoDomain instance for the Base URL typed in the form, or
 * the default instance while the value is not a usable URL.
 */
export const dodomainDashboardUrl = (baseUrl: string) => {
	const value = baseUrl.trim();
	return isSecureBaseUrl(value) ? new URL(value).origin : DODOMAIN_DEFAULT_BASE_URL;
};

/**
 * Schema of the DoDomain connect form.
 *
 * The secret key is write-only: when editing, a blank key means "keep the
 * stored key", so it is only required when connecting for the first time.
 * Whatever is typed must carry the `dd_sk_` prefix, the same rule the server
 * schema and the DoDomain SDK enforce.
 */
export const createDodomainSchema = ({ editing }: { editing: boolean }) =>
	z.object({
		name: z.string().trim().min(1, "Name is required"),
		secretKey: z.string().superRefine((value, ctx) => {
			const key = value.trim();
			if (!key) {
				if (!editing) {
					ctx.addIssue({
						code: "custom",
						message: DODOMAIN_SECRET_KEY_REQUIRED_MESSAGE,
					});
				}
				return;
			}
			if (!key.startsWith("dd_sk_")) {
				ctx.addIssue({
					code: "custom",
					message: DODOMAIN_SECRET_KEY_PREFIX_MESSAGE,
				});
			}
		}),
		appId: z.string().trim().min(1, "App ID is required"),
		baseUrl: z
			.string()
			.trim()
			.url("Enter a valid URL")
			.refine(isSecureBaseUrl, DODOMAIN_BASE_URL_SECURE_MESSAGE),
	});

export const dodomainSchema = createDodomainSchema({ editing: false });

export type DoDomainForm = z.infer<typeof dodomainSchema>;
