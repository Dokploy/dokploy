/**
 * Redacts credentials from rclone command strings and connection strings.
 *
 * Covers the existing S3 flags, provider-specific password/token flags, and
 * on-the-fly rclone connection-string parameters such as `pass=` or
 * `client_secret=`.
 */
export const redactRcloneCredentials = (command: string): string => {
	const sensitiveName =
		"(?:access[_-]?key(?:[_-]?id)?|secret(?:[_-]?access[_-]?key)?|pass(?:word)?|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)";

	return command
		.replace(/(--s3-access-key-id=)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1"[REDACTED]"')
		.replace(
			/(--s3-secret-access-key=)(?:"[^"]*"|'[^']*'|\S+)/gi,
			'$1"[REDACTED]"',
		)
		.replace(
			new RegExp(
				`(--[a-z0-9-]*${sensitiveName}=)(?:"[^"]*"|'[^']*'|\\S+)`,
				"gi",
			),
			'$1"[REDACTED]"',
		)
		.replace(
			new RegExp(`([,:]${sensitiveName}=)([^,:\\s'"/]+)`, "gi"),
			"$1[REDACTED]",
		);
};
