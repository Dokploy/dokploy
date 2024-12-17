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
			port: 8006,
			serviceName: "windows",
		},
	];

	const envs = [
		"# https://github.com/dockur/windows?tab=readme-ov-file#how-do-i-select-the-windows-version",
		"VERSION=win11",
		"",
		"# Uncomment this if your PC/VM or etc does not support virtualization technology",
		"# KVM=N",
		"",
		"DISK_SIZE=64G",
		"RAM_SIZE=4G",
		"CPU_CORES=2",
		"",
		"USERNAME=Dokploy",
		"PASSWORD=",
		"",
		"# https://github.com/dockur/windows?tab=readme-ov-file#how-do-i-select-the-windows-language",
		"LANGUAGE=English",
	];

	return {
		domains,
		envs,
	};
}
