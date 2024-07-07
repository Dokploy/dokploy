import {
	generateHash,
	generateRandomDomain,
	type Template,
	type Schema,
    generateBase64,
} from "../utils";

// https://cal.com/
export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);
    const calcomEncryptionKey = generateBase64(32);
    const nextAuthSecret = generateBase64(32);

	const envs = [
		`CALCOM_HOST=${randomDomain}`,
		"CALCOM_PORT=3000",
		`HASH=${mainServiceHash}`,
        `NEXTAUTH_SECRET=${nextAuthSecret}`,
        `CALENDSO_ENCRYPTION_KEY=${calcomEncryptionKey}`,
	];

	return {
		envs,
	};
}
