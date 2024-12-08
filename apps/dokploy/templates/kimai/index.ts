import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const domain = generateRandomDomain(schema);
	const domains: DomainSchema[] = [
		{
			host: domain,
			port: 8001,
			serviceName: "app",
		},
	];

	const adminPassword = generatePassword(32);
	const mysqlPassword = generatePassword(32);
	const mysqlRootPassword = generatePassword(32);
	const appSecret = generatePassword(32);

	const envs = [
		`KI_HOST=${domain}`,
		"KI_ADMINMAIL=admin@kimai.local",
		`KI_ADMINPASS=${adminPassword}`,
		`KI_MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`,
		`KI_MYSQL_PASSWORD=${mysqlPassword}`,
		`KI_APP_SECRET=${appSecret}`,
	];

	return {
		envs,
		domains,
	};
}
