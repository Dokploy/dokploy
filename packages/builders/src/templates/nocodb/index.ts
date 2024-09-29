// EXAMPLE
import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);
	const secretBase = generateBase64(64);

	const domains: DomainSchema[] = [
		{
			host: randomDomain,
			port: 8000,
			serviceName: "nocodb",
		},
	];

	const envs = ["NOCODB_PORT=8000", `NC_AUTH_JWT_SECRET=${secretBase}`];

	return {
		envs,
		domains,
	};
}
