// EXAMPLE
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
	const secretBase = generateBase64(64);
	const toptKeyBase = generateBase64(32);

	const envs = [
		`NOCODB_HOST=${randomDomain}`,
		"NOCODB_PORT=8000",
		`NC_AUTH_JWT_SECRET=${secretBase}`,
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
