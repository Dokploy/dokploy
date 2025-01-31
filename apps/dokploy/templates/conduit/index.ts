// EXAMPLE
import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const matrixSubdomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: matrixSubdomain,
			port: 6167,
			serviceName: "homeserver",
		},
	];

	const envs = [
		`MATRIX_SUBDOMAIN=${matrixSubdomain} # Replace by your server name`,
	];

	return {
		envs,
		domains,
	};
}
