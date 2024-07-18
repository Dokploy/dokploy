import {
	type Schema,
	type Template,
	generateHash,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);
	const apiDomain = generateRandomDomain(schema);
	const envs = [
		`MINIO_DASHBOARD_HOST=${randomDomain}`,
		"MINIO_DASHBOARD_PORT=9001",
		`MINIO_API_HOST=${apiDomain}`,
		"MINIO_API_PORT=9000",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
