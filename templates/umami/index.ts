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
	const randomSecret = generateBase64();

	const envs = [
		`UMAMI_HOST=${randomDomain}`,
		"UMAMI_PORT=3000",
		`APP_SECRET=${randomSecret}`,
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
