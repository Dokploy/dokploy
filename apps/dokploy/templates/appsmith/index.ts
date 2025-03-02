import {
	type DomainSchema,
	type Schema,
	type Template,
	generateHash,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);

	const domains: DomainSchema[] = [
		{
			host: generateRandomDomain(schema),
			port: 80,
			serviceName: "appsmith",
		},
	];

	return {
		domains,
	};
}
