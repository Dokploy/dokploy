import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const nextAuthSecret = generateBase64(32);
	const documensoEncryptionKey = generatePassword(32);
	const documensoSecondaryEncryptionKey = generatePassword(64);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "documenso",
		},
	];

	const envs = [
		`DOCUMENSO_HOST=${mainDomain}`,
		"DOCUMENSO_PORT=3000",
		`NEXTAUTH_SECRET=${nextAuthSecret}`,
		`NEXT_PRIVATE_ENCRYPTION_KEY=${documensoEncryptionKey}`,
		`NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY=${documensoSecondaryEncryptionKey}`,
	];

	return {
		envs,
		domains,
	};
}
