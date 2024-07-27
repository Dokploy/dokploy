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
		`UPTIME_KUMA_HOST=${randomDomain}`,
		"UPTIME_KUMA_PORT=3001",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
