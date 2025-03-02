import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 80,
			serviceName: "pocket-id",
		},
	];

	const envs = [
		"PUBLIC_UI_CONFIG_DISABLED=false",
		`PUBLIC_APP_URL=http://${mainDomain}`,
		"TRUST_PROXY=true",
	];

	return {
		domains,
		envs,
	};
}
