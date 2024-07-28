import {
	type Schema,
	type Template,
	generateHash,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);
	const rootPassword = generatePassword(32);
	const password = generatePassword(32);
	const envs = [
		`PHPMYADMIN_HOST=${randomDomain}`,
		"PHPMYADMIN_PORT=80",
		`HASH=${mainServiceHash}`,
		`MYSQL_ROOT_PASSWORD=${rootPassword}`,
		"MYSQL_DATABASE=mysql",
		"MYSQL_USER=phpmyadmin",
		`MYSQL_PASSWORD=${password}`,
	];

	return {
		envs,
	};
}
