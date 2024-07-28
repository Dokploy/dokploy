import {
	type Schema,
	type Template,
	generateBase64,
	generateHash,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);

	const nextAuthSecret = generateBase64(32);
	const documensoEncryptionKey = generatePassword(32);
	const documensoSecondaryEncryptionKey = generatePassword(64);

	const envs = [
		`DOCUMENSO_HOST=${randomDomain}`,
		"DOCUMENSO_PORT=3000",
		`HASH=${mainServiceHash}`,
		`NEXTAUTH_SECRET=${nextAuthSecret}`,
		`NEXT_PRIVATE_ENCRYPTION_KEY=${documensoEncryptionKey}`,
		`NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY=${documensoSecondaryEncryptionKey}`,
	];

	return {
		envs,
	};
}
