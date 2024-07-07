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
		`APP_SMITH_HOST=${randomDomain}`,
		"APP_SMITH_PORT=80",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
