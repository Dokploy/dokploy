import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const dbPassword = generatePassword();
	const dbUser = "slash";
	const dbName = "slash";

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 5231,
			serviceName: "slash-app",
		},
	];

	const envs = [
		`DB_USER=${dbUser}`,
		`DB_PASSWORD=${dbPassword}`,
		`DB_NAME=${dbName}`,
	];

	return {
		domains,
		envs,
	};
}
