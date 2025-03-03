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
	const postgresPassword = generatePassword();
	const nextSecret = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "linkwarden",
		},
	];

	const envs = [
		`POSTGRES_PASSWORD=${postgresPassword}`,
		`NEXTAUTH_SECRET=${nextSecret}`,
		`NEXTAUTH_URL=http://${mainDomain}/api/v1/auth`,
	];

	return {
		domains,
		envs,
	};
}
