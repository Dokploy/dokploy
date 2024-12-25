import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 4001,
			serviceName: "ontime",
		},
	];

	const envs = ["TZ=UTC"];

	return {
		domains,
		envs,
	};
}
