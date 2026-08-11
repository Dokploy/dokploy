import esbuild from "esbuild";

esbuild
	.build({
		entryPoints: {
			server: "server/server.ts",
			migration: "../dokploy/migration.ts",
			"wait-for-postgres": "../dokploy/wait-for-postgres.ts",
			"reset-password": "../dokploy/reset-password.ts",
			"reset-2fa": "../dokploy/reset-2fa.ts",
			"migrate-auth-secret": "../dokploy/scripts/migrate-auth-secret.ts",
		},
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node18",
		outExtension: { ".js": ".mjs" },
		minify: true,
		sourcemap: true,
		outdir: "dist-server",
		tsconfig: "tsconfig.json",
		packages: "external",
	})
	.catch(() => process.exit(1));
