import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const domains: DomainSchema[] = [
		{
			host: generateRandomDomain(schema),
			port: 5000,
			serviceName: "registry",
		},
	];

	const registryHttpSecret = generatePassword(30);

	const envs = [`REGISTRY_HTTP_SECRET=${registryHttpSecret}`];

	const mounts: Template["mounts"] = [
		{
			filePath: "/auth/registry.password",
			content:
				"# from: docker run --rm --entrypoint htpasswd httpd:2 -Bbn docker password\ndocker:$2y$10$qWZoWev/u5PV7WneFoRAMuoGpRcAQOgUuIIdLnU7pJXogrBSY23/2\n",
		},
	];

	return {
		domains,
		envs,
		mounts,
	};
}
