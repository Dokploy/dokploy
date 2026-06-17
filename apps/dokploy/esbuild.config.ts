import dotenv, { type DotenvParseOutput } from "dotenv";
import esbuild from "esbuild";

const result = dotenv.config({ path: ".env.production" });

// Keys whose value must be read from process.env at runtime, not baked in at
// build time. Add a key here when an operator should be able to tune it from
// docker-compose env / systemd unit / shell without rebuilding the bundle.
const RUNTIME_ONLY_ENV_KEYS = new Set([
	"DATABASE_URL",
	"DEPLOYMENT_SHUTDOWN_GRACE_MS",
]);

function prepareDefine(config: DotenvParseOutput | undefined) {
	const define = {};
	// @ts-ignore
	for (const [key, value] of Object.entries(config)) {
		if (RUNTIME_ONLY_ENV_KEYS.has(key)) {
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
				"migrate-auth-secret": "scripts/migrate-auth-secret.ts",
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
