// EXAMPLE
import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const matrixSubdomain = `matrix.${generateRandomDomain(schema)}`;

	const domains: DomainSchema[] = [
		{
			host: matrixSubdomain,
			port: 6167,
			serviceName: "homeserver",
		},
	];

	const envs = [
		`MATRIX_SUBDOMAIN=https://${matrixSubdomain} # Replace by your server name`,
	];

	return {
		envs,
		domains,
	};
}
