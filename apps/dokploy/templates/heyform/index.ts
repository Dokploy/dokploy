import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const sessionKey = generateBase64(64);
	const formEncryptionKey = generateBase64(64);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8000,
			serviceName: "heyform",
		},
	];

	const envs = [
		`APP_HOMEPAGE_URL=http://${mainDomain}`,
		`SESSION_KEY=${sessionKey}`,
		`FORM_ENCRYPTION_KEY=${formEncryptionKey}`,
	];

	return {
		envs,
		domains,
	};
}
