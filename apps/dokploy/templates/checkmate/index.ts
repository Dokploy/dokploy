import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);

	const envs = [`DOMAIN=${mainDomain}`];

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 80,
			serviceName: "client",
		},
	];

	return {
		domains,
		envs,
	};
}
