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
			port: 9080,
			serviceName: "answer",
		},
	];

	const envs = [
		`ANSWER_HOST=http://${mainDomain}`,
		`SERVICE_HASH=${mainServiceHash}`,
	];

	const mounts: Template["mounts"] = [];

	return {
		envs,
		mounts,
		domains,
	};
}
