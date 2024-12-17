import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainHost = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: mainHost,
			port: 3000,
			serviceName: "browserless",
		},
	];
	const envs = [
		`BROWERLESS_HOST=${mainHost}`,
		`BROWSERLESS_TOKEN=${generatePassword(16)}`,
	];

	return {
		envs,
		domains,
	};
}
