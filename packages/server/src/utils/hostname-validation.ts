// Valid hostname per RFC 1123: labels of letters, digits and hyphens
// (no leading/trailing hyphen), separated by dots. Underscores are rejected
// because Let's Encrypt refuses to issue certificates for them.
export const VALID_HOSTNAME_REGEX =
	/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export const INVALID_HOSTNAME_MESSAGE =
	"Invalid domain name. Use only letters, numbers, hyphens and dots (e.g. example.com). Underscores are not allowed.";
