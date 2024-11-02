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
			port: 8080,
			serviceName: "filebrowser",
		},
	];
	const envs = ["FB_BASEURL=/filebrowser"];

	return {
		envs,
		domains,
	};
}
