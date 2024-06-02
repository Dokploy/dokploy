import {
	generateHash,
	generateRandomDomain,
	type Template,
	type Schema,
} from "../utils";

// https://pocketbase.io/docs/
export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);

	const envs = [
		`POCKETBASE_HOST=${randomDomain}`,
		"POCKETBASE_PORT=80",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
