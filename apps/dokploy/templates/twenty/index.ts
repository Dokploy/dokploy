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
	const dbPassword = generatePassword();
	const dbUser = "twenty";
	const appSecret = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "twenty-server",
		},
	];

	const envs = [
		`TWENTY_HOST=${mainDomain}`,
		`DB_USER=${dbUser}`,
		`DB_PASSWORD=${dbPassword}`,
		`APP_SECRET=${appSecret}`,
		"# Optional: Configure storage path",
		"# STORAGE_LOCAL_PATH=.local-storage",
	];

	return {
		domains,
		envs,
	};
}
