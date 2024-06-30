import {
	generateHash,
	generateRandomDomain,
	type Template,
	type Schema,
	generateBase64,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);

	const nextAuthSecret = generateBase64(32);
	const documensoEncryptionKey = generateBase64(32);
	const documensoSecondaryEncryptionKey = generateBase64(32);

	const envs = [
		`DOCUMENSO_HOST=${randomDomain}`,
		"DOCUMENSO_PORT=3000",
		`HASH=${mainServiceHash}`,
		`NEXTAUTH_SECRET=${nextAuthSecret}`,
		`NEXT_PRIVATE_ENCRYPTION_KEY=${documensoEncryptionKey}`,
		`NEXT_PRIVATE_SECONDARY_ENCRYPTION_KEY=${documensoSecondaryEncryptionKey}`,
	];

	return {
		envs,
	};
}
