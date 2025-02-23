import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const domains: DomainSchema[] = [
		{
			host: generateRandomDomain(schema),
			port: 3000,
			serviceName: "wiki",
		},
	];

	const envs = [
		"# Database Setup",
		"POSTGRES_USER=wikijs",
		"POSTGRES_PASSWORD=wikijsrocks",
		"POSTGRES_DB=wiki",
		"# WikiJS Database Connection",
		"DB_TYPE=postgres",
		"DB_HOST=db",
		"DB_PORT=5432",
		"DB_USER=wikijs",
		"DB_PASS=wikijsrocks",
		"DB_NAME=wiki",
	];

	return {
		domains,
		envs,
	};
}
