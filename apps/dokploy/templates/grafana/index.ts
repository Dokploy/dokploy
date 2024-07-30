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
		`GRAFANA_HOST=${randomDomain}`,
		"GRAFANA_PORT=3000",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
