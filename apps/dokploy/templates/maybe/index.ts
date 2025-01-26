import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const secretKeyBase = generateBase64(64);
	const synthApiKey = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "app",
		},
	];

	const envs = [
		`SECRET_KEY_BASE=${secretKeyBase}`,
		"SELF_HOSTED=true",
		`SYNTH_API_KEY=${synthApiKey}`,
		"RAILS_FORCE_SSL=false",
		"RAILS_ASSUME_SSL=false",
		"GOOD_JOB_EXECUTION_MODE=async",
	];

	const mounts: Template["mounts"] = [
		{
			filePath: "./uploads",
			content: "This is where user uploads will be stored",
		},
	];

	return {
		envs,
		mounts,
		domains,
	};
}
