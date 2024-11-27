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
	const dbUser = "postiz";
	const dbName = "postiz";
	const jwtSecret = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 5000,
			serviceName: "postiz-app",
		},
	];

	const envs = [
		`POSTIZ_HOST=${mainDomain}`,
		`DB_PASSWORD=${dbPassword}`,
		`DB_USER=${dbUser}`,
		`DB_NAME=${dbName}`,
		`JWT_SECRET=${jwtSecret}`,
	];

	return {
		domains,
		envs,
	};
}
