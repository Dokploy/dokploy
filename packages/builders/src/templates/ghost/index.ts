import {
	type DomainSchema,
	type Schema,
	type Template,
	generateHash,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 2368,
			serviceName: "ghost",
		},
	];
	const envs = [`GHOST_HOST=${mainDomain}`];

	return {
		envs,
		domains,
	};
}
