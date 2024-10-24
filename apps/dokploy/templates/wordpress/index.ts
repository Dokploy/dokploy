import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);
	const mysqlPassword = generatePassword(32);
	const mysqlRootPassword = generatePassword(32);

	const domains: DomainSchema[] = [
		{
			host: randomDomain,
			port: 80,
			serviceName: "wordpress",
		},
	];

	const envs = [
		`MYSQL_PASSWORD=${mysqlPassword}`,
		`MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`,
	];

	return {
		domains,
		envs,
	};
}
