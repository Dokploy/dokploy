import {
	generateHash,
	generateRandomDomain,
	type Template,
	type Schema,
} from "../utils";

// https://cal.com/
export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);
	const envs = [
		`CALCOM_HOST=${randomDomain}`,
		"CALCOM_PORT=3000",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
