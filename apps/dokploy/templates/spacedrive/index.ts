import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);
	const secretKey = generatePassword();
	const randomUsername = "admin"; // Default username

	const domains: DomainSchema[] = [
		{
			host: randomDomain,
			port: 8080,
			serviceName: "server",
		},
	];

	const envs = [`SD_USERNAME=${randomUsername}`, `SD_PASSWORD=${secretKey}`];

	return {
		envs,
		domains,
	};
}
