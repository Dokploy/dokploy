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
			port: 9000,
			serviceName: "app",
		},
	];

	const envs = [
		"# visit the page to setup your super admin user",
		"# check config.toml in Advanced / Volumes for more options",
	];

	const mounts: Template["mounts"] = [
		{
			filePath: "config.toml",
			content: `[app]
address = "0.0.0.0:9000"

[db]
host = "db"
port = 5432
user = "listmonk"
password = "listmonk"
database = "listmonk"

ssl_mode = "disable"
max_open = 25
max_idle = 25
max_lifetime = "300s"

params = ""
`,
		},
	];

	return {
		envs,
		mounts,
		domains,
	};
}
