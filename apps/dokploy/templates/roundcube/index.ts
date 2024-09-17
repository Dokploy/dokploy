import type { Schema, Template } from "../utils";

export function generate(schema: Schema): Template {
	const envs = [
		"DEFAULT_HOST=tls://mail.example.com",
		"SMTP_SERVER=tls://mail.example.com",

	];

	return { envs };
}