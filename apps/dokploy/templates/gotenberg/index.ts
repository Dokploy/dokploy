import { type Schema, type Template, generatePassword } from "../utils";

export function generate(schema: Schema): Template {
	const username = "gotenberg";
	const password = generatePassword(32);

	const envs = [
		`GOTENBERG_API_BASIC_AUTH_USERNAME=${username}`,
		`GOTENBERG_API_BASIC_AUTH_PASSWORD=${password}`,
	];

	return {
		envs,
	};
}
