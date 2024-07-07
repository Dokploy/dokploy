import {
	generateHash,
	generateRandomDomain,
	type Template,
	type Schema,
	generateBase64,
	generatePassword,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);
	const nextAuthSecret = generateBase64(32);
	const encryptionKey = generatePassword(32);

	const envs = [
		`FORMBRICKS_HOST=${randomDomain}`,
		"FORMBRICKS_HOST=3100",
		`HASH=${mainServiceHash}`,
		`NEXTAUTH_SECRET=${nextAuthSecret}`,
		`ENCRYPTION_KEY=${encryptionKey}`,
		"MAIL_FROM=",
		"SMTP_HOST=",
		"SMTP_PORT=",
		"SMTP_SECURE_ENABLED=",
		"SMTP_USER=",
		"SMTP_PASSWORD=",
		"EMAIL_AUTH_DISABLED=1",
		"PASSWORD_RESET_DISABLED=1",
		"EMAIL_VERIFICATION_DISABLED=1",
		"TELEMETRY_DISABLED=1",
		"SIGNUP_DISABLED=1",
		"GITHUB_AUTH_ENABLED=1",
		"GITHUB_ID=",
		"GITHUB_SECRET=",
	];

	return {
		envs,
	};
}
