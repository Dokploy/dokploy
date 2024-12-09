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
			port: 8086,
			serviceName: "influxdb",
		},
	];
	return {
		domains,
	};
}
