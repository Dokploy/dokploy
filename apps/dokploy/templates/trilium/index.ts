import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const triliumDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: triliumDomain,
			port: 8080,
			serviceName: "trilium",
		},
	];

	return {
		domains,
	};
}
