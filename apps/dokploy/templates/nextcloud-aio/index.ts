import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);
	const envs = [
		"NEXTCLOUD_DOMAIN=mynextclouddomain.tld",
		"MYSQL_SECRET_PASSWORD=MYSQLPASSWORDCHANGEME",
		"MYSQL_SECRET_PASSWORD_ROOT=MYSQLPASSWORDROOT_CHANGEME",
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
