const CREDENTIAL_FLAG_PATTERN =
	/(--(?:s3-access-key-id|s3-secret-access-key|azureblob-key|azureblob-sas-url)=)(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+)/g;

export const redactRcloneCredentials = (command: string): string => {
	return command.replace(CREDENTIAL_FLAG_PATTERN, '$1"[REDACTED]"');
};
