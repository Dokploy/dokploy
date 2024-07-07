import {
	generateHash,
	generateRandomDomain,
	type Template,
	type Schema,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);
	const envs = [
		`GHOST_HOST=${randomDomain}`,
		"GHOST_PORT=2368",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
