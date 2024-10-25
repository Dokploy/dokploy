import path from "node:path";
import { vitePlugin as remix } from "@remix-run/dev";
import esbuild from "esbuild";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

declare module "@remix-run/node" {
	interface Future {
		v3_singleFetch: true;
	}
}

export default defineConfig({
	plugins: [
		remix({
			future: {
				v3_fetcherPersist: true,
				v3_relativeSplatPath: true,
				v3_throwAbortReason: true,
				v3_singleFetch: true,
				v3_lazyRouteDiscovery: true,
			},
			serverBuildFile: "remix.js",
			buildEnd: async () => {
				await esbuild
					.build({
						alias: {
							"~": "./app",
							"@dokploy/server": "../../packages/server/src",
						},
						outfile: "build/server/index.js",
						entryPoints: ["server/server.ts"],
						external: ["./build/server/*"],
						platform: "node",
						format: "esm",
						packages: "external",
						bundle: true,
						logLevel: "info",
					})
					.catch((error: unknown) => {
						console.error("Error building server:", error);
						process.exit(1);
					});
			},
		}),
		tsconfigPaths(),
	],
	resolve: {
		alias: {
			"@dokploy/server": path.resolve(__dirname, "../../packages/server/src"),
		},
	},
});
