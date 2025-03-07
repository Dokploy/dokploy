import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const domains: DomainSchema[] = [
		{
			host: generateRandomDomain(schema),
			port: 8080,
			serviceName: "datalens",
		},
	];

	const envs = ["HC=1"];

	return {
		envs,
		domains,
	};
}
