import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const randomDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: randomDomain,
			port: 8080,
			serviceName: "open-webui",
		},
	];
	const envs = ["OLLAMA_DOCKER_TAG=0.1.47", "WEBUI_DOCKER_TAG=0.3.7"];

	return {
		envs,
		domains,
	};
}
