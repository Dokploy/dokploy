/**
 * Redacts S3 and Azure Blob Storage credentials from rclone command strings.
 *
 * Used to prevent credential leakage in structured logs and error output.
 * Matches the flag formats:
 *   --s3-access-key-id="VALUE", --s3-secret-access-key="VALUE",
 *   --azureblob-key="VALUE", and --azureblob-sas-url="VALUE"
 */
export const redactRcloneCredentials = (command: string): string => {
	return command
		.replace(/(--s3-access-key-id=)"[^"]*"/g, '$1"[REDACTED]"')
		.replace(/(--s3-secret-access-key=)"[^"]*"/g, '$1"[REDACTED]"')
		.replace(/(--azureblob-key=)"[^"]*"/g, '$1"[REDACTED]"')
		.replace(/(--azureblob-sas-url=)"[^"]*"/g, '$1"[REDACTED]"');
};
