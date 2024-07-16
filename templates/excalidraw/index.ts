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
		`EXCALIDRAW_HOST=${randomDomain}`,
		"EXCALIDRAW_PORT=80",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
