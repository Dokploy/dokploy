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
			serviceName: "gitea",
		},
	];
	const envs = ["USER_UID=1000", "USER_GID=1000"];

	return {
		envs,
		domains,
	};
}
