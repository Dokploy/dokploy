import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const mysqlPassword = generatePassword();
	const mysqlRootPassword = generatePassword();
	const adminPassword = generatePassword();

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 80,
			serviceName: "yourls-app",
		},
	];

	const envs = [
		`YOURLS_HOST=${mainDomain}`,
		"YOURLS_ADMIN_USER=admin",
		`YOURLS_ADMIN_PASSWORD=${adminPassword}`,
		`MYSQL_PASSWORD=${mysqlPassword}`,
		`MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`,
	];

	return {
		domains,
		envs,
	};
}
