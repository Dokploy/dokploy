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
	const dbUsername = "invoiceshelf";
	const dbDatabase = "invoiceshelf";

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 80,
			serviceName: "invoiceshelf-app",
		},
	];

	const envs = [
		`INVOICESHELF_HOST=${mainDomain}`,
		`DB_PASSWORD=${dbPassword}`,
		`DB_USERNAME=${dbUsername}`,
		`DB_DATABASE=${dbDatabase}`,
	];

	return {
		domains,
		envs,
	};
}
