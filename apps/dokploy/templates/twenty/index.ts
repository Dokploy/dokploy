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
	const pgPassword = generatePassword();
	const pgUser = "twenty";
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
		`PGUSER=${pgUser}`,
		`PGPASSWORD=${pgPassword}`,
		`APP_SECRET=${appSecret}`,
		"# Optional: Configure storage path",
		"# STORAGE_LOCAL_PATH=.local-storage",
	];

	return {
		domains,
		envs,
	};
}
