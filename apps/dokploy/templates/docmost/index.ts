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
			serviceName: "docmost",
		},
	];

	const envs = [
		"POSTGRES_DB=docmost",
		"POSTGRES_USER=docmost",
		"POSTGRES_PASSWORD=STRONG_DB_PASSWORD",
		"APP_URL=http://localhost:3000",
		"APP_SECRET=VERY_STRONG_SECRET",
	];

	return {
		domains,
		envs,
	};
}
