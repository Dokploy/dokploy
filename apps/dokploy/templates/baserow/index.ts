import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainHost = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: mainHost,
			port: 80,
			serviceName: "baserow",
		},
	];
	const envs = [`BASEROW_HOST=${mainHost}`];

	return {
		envs,
		domains,
	};
}
