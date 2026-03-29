import dotenv, { type DotenvParseOutput } from "dotenv";
import esbuild from "esbuild";

const result = dotenv.config({ path: ".env.production" });

function prepareDefine(config: DotenvParseOutput | undefined) {
	const define = {};
	// These environment variables must resolve at runtime, not build time
	const runtimeEnvVars = new Set([
		"DATABASE_URL",
		"REDIS_URL",
		"REDIS_HOST",
		"REDIS_PORT",
		"REDIS_PASSWORD",
		"POSTGRES_PASSWORD_FILE",
		"POSTGRES_USER",
		"POSTGRES_DB",
		"POSTGRES_HOST",
		"POSTGRES_PORT",
	]);
	// @ts-ignore
	for (const [key, value] of Object.entries(config)) {
		if (runtimeEnvVars.has(key)) {
			continue;
		}
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
				migration: "migration.ts",
				"wait-for-postgres": "wait-for-postgres.ts",
				"reset-password": "reset-password.ts",
				"reset-2fa": "reset-2fa.ts",
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
