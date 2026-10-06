/**
 * Pure helpers for the preview deployment wildcard domain (`previewWildcard`).
 *
 * Kept free of server-only imports so the settings forms can share the exact
 * rule the preview deployment service applies.
 */

export const PREVIEW_WILDCARD_TEMPLATE_VARIABLES = [
	"${prNumber}",
	"${branchName}",
	"${uniqueId}",
] as const;

export const PREVIEW_WILDCARD_GUIDANCE =
	'Use a wildcard like "*.preview.example.com" or a template such as "${prNumber}.preview.example.com"';

/**
 * True when the value contains a template variable that makes each preview
 * host unique (`${prNumber}`, `${branchName}` or `${uniqueId}`). Such values go
 * through the template path instead of `generateWildcardDomain`.
 */
export const hasPreviewTemplateVariable = (value: string): boolean =>
	PREVIEW_WILDCARD_TEMPLATE_VARIABLES.some((variable) =>
		value.includes(variable),
	);

/**
 * Mirrors what preview creation accepts: an empty/missing value (falls back to
 * the default `*.sslip.io`), a template variable, or a base domain starting
 * with `*.`.
 */
export const isValidPreviewWildcard = (value: string | null | undefined) => {
	if (!value) {
		return true;
	}
	return hasPreviewTemplateVariable(value) || value.startsWith("*.");
};
