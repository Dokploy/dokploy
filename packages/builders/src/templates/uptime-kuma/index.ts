import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: randomDomain,
			port: 3001,
			serviceName: "uptime-kuma",
		},
	];

	return {
		domains,
	};
}