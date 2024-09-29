import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const rootPassword = generatePassword(32);
	const password = generatePassword(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 80,
			serviceName: "phpmyadmin",
		},
	];
	const envs = [
		`MYSQL_ROOT_PASSWORD=${rootPassword}`,
		"MYSQL_DATABASE=mysql",
		"MYSQL_USER=phpmyadmin",
		`MYSQL_PASSWORD=${password}`,
	];

	return {
		envs,
		domains,
	};
}
