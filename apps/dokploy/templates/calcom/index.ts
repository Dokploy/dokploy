import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const calcomEncryptionKey = generateBase64(32);
	const nextAuthSecret = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "calcom",
		},
	];

	const envs = [
		`CALCOM_HOST=${mainDomain}`,
		`NEXTAUTH_SECRET=${nextAuthSecret}`,
		`CALENDSO_ENCRYPTION_KEY=${calcomEncryptionKey}`,
	];

	return {
		envs,
		domains,
	};
}
