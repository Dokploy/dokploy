import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const metricsDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 6001,
			serviceName: "soketi",
		},
		{
			host: metricsDomain,
			port: 9601,
			serviceName: "soketi",
		},
	];

	return {
		domains,
	};
}
