import {
	type Schema,
	type Template,
	generateBase64,
	generateHash,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);
	const secretKey = generateBase64(32);
	const envs = [
		`GLITCHTIP_HOST=${randomDomain}`,
		"GLITCHTIP_PORT=8000",
		`SECRET_KEY=${secretKey}`,
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
