import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const authSecret = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8080,
			serviceName: "aptabase",
		},
	];

	const envs = [`APTABASE_HOST=${mainDomain}`, `AUTH_SECRET=${authSecret}`];

	return {
		envs,
		domains,
	};
}
