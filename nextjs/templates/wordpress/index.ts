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
		`WORDPRESS_HOST=${randomDomain}`,
		"WORDPRESS_PORT=80",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
