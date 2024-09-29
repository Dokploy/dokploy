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
			port: 3000,
			serviceName: "rocketchat",
		},
	];

	const envs = [`ROCKETCHAT_HOST=${mainDomain}`, "ROCKETCHAT_PORT=3000"];

	return {
		envs,
		domains,
	};
}
