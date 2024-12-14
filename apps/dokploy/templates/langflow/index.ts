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
	const dbUsername = "langflow";

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 7860,
			serviceName: "langflow",
		},
	];

	const envs = [`DB_PASSWORD=${dbPassword}`, `DB_USERNAME=${dbUsername}`];

	return {
		domains,
		envs,
	};
}
