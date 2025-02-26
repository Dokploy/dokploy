import type { Schema, Template } from "../utils";

export function generate(_schema: Schema): Template {
	const envs = [`CLOUDFLARE_TUNNEL_TOKEN="<INSERT TOKEN>"`];

	return {
		envs,
	};
}
