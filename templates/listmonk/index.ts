import {
	type Schema,
	type Template,
	generateHash,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainServiceHash = generateHash(schema.projectName);
	const randomDomain = generateRandomDomain(schema);
	const adminPassword = generatePassword(32);

	const envs = [
		`LISTMONK_HOST=${randomDomain}`,
		"LISTMONK_PORT=9000",
		`HASH=${mainServiceHash}`,
		`# login with admin:${adminPassword}`,
		"# check config.toml in Advanced / Volumes for more options",
	];

	const mounts: Template["mounts"] = [
		{
			mountPath: "./config.toml",
			content: `[app]
address = "0.0.0.0:9000"

admin_username = "admin"
admin_password = "${adminPassword}"

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
	};
}
