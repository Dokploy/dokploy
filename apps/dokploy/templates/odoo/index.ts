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
		`ODOO_HOST=${randomDomain}`,
		"ODOO_PORT=8069",
		`HASH=${mainServiceHash}`,
	];

	return {
		envs,
	};
}
