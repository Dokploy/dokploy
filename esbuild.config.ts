import esbuild from "esbuild";

import dotenv, { type DotenvParseOutput } from "dotenv";

const result = dotenv.config({ path: ".env.production" });

function prepareDefine(config: DotenvParseOutput | undefined) {
	const define = {};
	// @ts-ignore
	for (const [key, value] of Object.entries(config)) {
		// @ts-ignore
		define[`process.env.${key}`] = JSON.stringify(value);
	}
	return define;
}

const define = prepareDefine(result.parsed);
try {
	esbuild
		.build({
			entryPoints: {
				server: "server/server.ts",
				"reset-password": "reset-password.ts",
			},
			bundle: true,
			platform: "node",
			format: "esm",
			target: "node18",
			outExtension: { ".js": ".mjs" },
			minify: true,
			sourcemap: true,
			outdir: "dist",
			tsconfig: "tsconfig.server.json",
			define,
			packages: "external",
		})
		.catch(() => {
			return process.exit(1);
		});
} catch (error) {
	console.log(error);
}
