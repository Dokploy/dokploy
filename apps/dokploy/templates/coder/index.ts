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
			port: 7080,
			serviceName: "coder",
		},
	];

	const envs = [
		"CODER_ACCESS_URL=",
		"CODER_HTTP_ADDRESS=0.0.0.0:7080",
		"",
		"POSTGRES_DB=coder",
		"POSTGRES_USER=coder",
		"POSTGRES_PASSWORD=VERY_STRONG_PASSWORD",
	];

	return {
		domains,
		envs,
	};
}
