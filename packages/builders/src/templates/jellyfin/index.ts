// EXAMPLE
import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const domain = generateRandomDomain(schema);
	const domains: DomainSchema[] = [
		{
			host: domain,
			port: 8096,
			serviceName: "jellyfin",
		},
	];

	const envs = [`JELLYFIN_HOST=${domain}`];

	return {
		envs,
		domains,
	};
}
