import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const username = "gotenberg";
	const password = "changethis";

	const envs = [
		`GOTENBERG_API_BASIC_AUTH_USERNAME=${username}`,
		`GOTENBERG_API_BASIC_AUTH_PASSWORD=${password}`,
	];

	return {
		envs,
	};
}
