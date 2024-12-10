import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const adminDomain = generateRandomDomain(schema);
	const postgresPassword = generatePassword();

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3001,
			serviceName: "app",
		},
		{
			host: adminDomain,
			port: 3002,
			serviceName: "app",
		},
	];

	const envs = [
		`LOGTO_ENDPOINT=http://${adminDomain}`,
		`LOGTO_ADMIN_ENDPOINT=http://${adminDomain}`,
		`LOGTO_POSTGRES_PASSWORD=${postgresPassword}`,
	];

	return {
		domains,
		envs,
	};
}
