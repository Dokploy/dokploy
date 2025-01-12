import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const username = "gotenberg";
	const password = "changethis";

	const domains: DomainSchema[] = [
		{
			host: generateRandomDomain(schema),
			port: 3000,
			serviceName: "gotenberg",
		},
	];

	const envs = [
		`GOTENBERG_API_BASIC_AUTH_USERNAME=${username}`,
		`GOTENBERG_API_BASIC_AUTH_PASSWORD=${password}`,
	];

	return {
		envs,
		domains,
	};
}
