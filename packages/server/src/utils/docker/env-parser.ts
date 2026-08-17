// Based on the `parse` function of dotenv v16.4.5 (BSD-2-Clause)
// https://github.com/motdotla/dotenv
//
// Modified to follow Docker Compose comment semantics: a `#` starts an
// inline comment only when preceded by whitespace, so unquoted values such
// as PASSWORD=secret# or KEY=sec#ret keep the `#` instead of being
// truncated. This also matches how docker compose reads the generated
// `.env` files.

const LINE =
	/(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

const QUOTE_WRAPPED = /^(['"`])([\s\S]*)\1$/;

export const parseEnvVariables = (src: string): Record<string, string> => {
	const obj: Record<string, string> = {};

	// Strip a leading BOM and normalize line breaks
	const lines = src.replace(/^\uFEFF/, "").replace(/\r\n?/gm, "\n");

	let match = LINE.exec(lines);
	while (match != null) {
		const key = match[1] as string;

		// Default undefined or null to empty string
		let value = match[2] || "";

		// A `#` starts an inline comment only when the value is not fully
		// quoted and the `#` is preceded by whitespace (Docker Compose rule)
		if (!QUOTE_WRAPPED.test(value.trim())) {
			const commentIndex = value.search(/\s#/);
			if (commentIndex !== -1) {
				value = value.slice(0, commentIndex);
			}
		}

		// Remove whitespace
		value = value.trim();

		// Check if double quoted
		const maybeQuote = value[0];

		// Remove surrounding quotes
		value = value.replace(QUOTE_WRAPPED, "$2");

		// Expand newlines if double quoted
		if (maybeQuote === '"') {
			value = value.replace(/\\n/g, "\n");
			value = value.replace(/\\r/g, "\r");
		}

		obj[key] = value;

		match = LINE.exec(lines);
	}

	return obj;
};
