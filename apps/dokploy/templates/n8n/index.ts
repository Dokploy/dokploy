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
		`N8N_HOST=${randomDomain}`,
		"N8N_PORT=5678",
		`HASH=${mainServiceHash}`,
		"GENERIC_TIMEZONE=Europe/Berlin",
	];

	return {
		envs,
	};
}
