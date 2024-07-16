import {
	type Schema,
	type Template,
	generateHash,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);
	const envs = [
		`DIRECTUS_HOST=${randomDomain}`,
		"DIRECTUS_PORT=8055",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
