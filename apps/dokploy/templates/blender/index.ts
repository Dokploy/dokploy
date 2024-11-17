import {
	type DomainSchema,
	type Schema,
	type Template,
	generateHash,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const mainDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "blender",
		},
	];

	const envs = [
		"PUID=1000",
		"PGID=1000",
		"TZ=Etc/UTC",
		"SUBFOLDER=/",
		"NVIDIA_VISIBLE_DEVICES=all",
		"NVIDIA_DRIVER_CAPABILITIES=all",
	];

	return {
		envs,
		domains,
	};
}
