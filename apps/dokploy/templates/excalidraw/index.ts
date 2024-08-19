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
			port: 80,
			serviceName: "excalidraw",
		},
	];

	return {
		domains,
	};
}
