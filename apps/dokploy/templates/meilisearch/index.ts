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
	const masterKey = generateBase64(32);
	const envs = [
		`MEILISEARCH_HOST=${randomDomain}`,
		"MEILISEARCH_PORT=7700",
		"MEILI_ENV=development",
		`MEILI_MASTER_KEY=${masterKey}`,
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
