import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const apiDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 5601,
			serviceName: "kibana",
		},
		{
			host: apiDomain,
			port: 9200,
			serviceName: "elasticsearch",
		},
	];

	return {
		domains,
	};
}
