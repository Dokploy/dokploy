import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);
	const databasePassword = generatePassword();
	const databaseRootPassword = generatePassword();
	const envs = [
		`NEXTCLOUD_DOMAIN=${randomDomain}`,
		`MYSQL_SECRET_PASSWORD=${databasePassword}`,
		`MYSQL_SECRET_PASSWORD_ROOT=${databaseRootPassword}`,
	];

	const domains: DomainSchema[] = [
		{
			host: randomDomain,
			port: 80,
			serviceName: "nextcloud",
		},
	];

	return { envs, domains };
}
