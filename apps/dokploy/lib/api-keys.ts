import { z } from "zod";

/**
 * Maximum length allowed for an API key name.
 *
 * This mirrors the default `maximumNameLength` enforced by the
 * `@better-auth/api-key` plugin. Names longer than this are rejected by
 * better-auth with a 400, so we validate against it up front to surface a
 * clear field-level error instead of an opaque 500.
 */
export const API_KEY_NAME_MAX_LENGTH = 32;

/**
 * Shared validation for an API key name, used by both the tRPC input schema
 * and the client form so the two can't drift.
 */
export const apiKeyNameSchema = z
	.string()
	.min(1, "Name is required")
	.max(
		API_KEY_NAME_MAX_LENGTH,
		`Name must be at most ${API_KEY_NAME_MAX_LENGTH} characters`,
	);

/**
 * Whether an organization role may create an API key on behalf of another
 * member. Owners and admins may; everyone else may only mint for themselves.
 *
 * A key minted this way carries the TARGET user's permissions, so this is the
 * one place that decision lives, kept pure so it can be unit tested.
 */
export const canCreateApiKeyForAnotherUser = (
	role?: string | null,
): boolean => role === "owner" || role === "admin";

