const REDACTED = "[redacted]";

const SECRET_FLAG_PATTERN =
	/--(?!(?:password-stdin)\b)([\w-]*(?:secret|password|token|private-key|access-key)[\w-]*)(=|\s+)(?:"[^"]*"|'[^']*'|[^\s|;&]+)/gi;

const SECRET_ASSIGNMENT_PATTERN =
	/\b([A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*=)(?:"[^"]*"|'[^']*'|[^\s|;&]+)/g;

const SECRET_HEADER_PATTERN =
	/\b(Authorization:\s*(?:Bearer|Basic)\s+|(?:x-api-key|api-key):\s*)([^\s]+)/gi;

const CREDENTIAL_URL_PATTERN =
	/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi;

const DOCKER_LOGIN_ECHO_PATTERN =
	/(\becho\s+)(?:"[^"]*"|'[^']*'|[^|;&\n]+)(\s*\|\s*docker\s+login\b)/gi;

const DATABASE_PASSWORD_PATTERN = /(\s-p)(?:"[^"]*"|'[^']*'|[^\s|;&]+)/g;

export const redactSecrets = (value: string) => {
	return value
		.replace(SECRET_FLAG_PATTERN, (_match, name: string, separator: string) => {
			return `--${name}${separator}${REDACTED}`;
		})
		.replace(SECRET_ASSIGNMENT_PATTERN, `$1${REDACTED}`)
		.replace(SECRET_HEADER_PATTERN, `$1${REDACTED}`)
		.replace(CREDENTIAL_URL_PATTERN, `$1${REDACTED}$3`)
		.replace(DOCKER_LOGIN_ECHO_PATTERN, `$1${REDACTED}$2`)
		.replace(DATABASE_PASSWORD_PATTERN, `$1${REDACTED}`);
};

export const redactError = (error: Error) => {
	const redactedError = new Error(redactSecrets(error.message));
	redactedError.name = error.name;
	if (error.stack) {
		redactedError.stack = redactSecrets(error.stack);
	}
	return redactedError;
};
