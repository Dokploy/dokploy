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
			port: 9001,
			serviceName: "minio",
		},
		{
			host: apiDomain,
			port: 9000,
			serviceName: "minio",
		},
	];

	return {
		domains,
	};
}
