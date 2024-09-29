import { defineConfig } from "tsup";
// import tsconfigPaths from "tsconfig-paths";
import { aliasPath } from "esbuild-plugin-alias-path";

// console.log("Absolute base URL:", absoluteBaseUrl);
// if (absoluteBaseUrl) {
// tsconfigPaths.register({
// 	baseUrl: absoluteBaseUrl.,
// 	paths,
// });
// }

// console.log("baseUrl", tsconfigPaths.loadConfig("./tsconfig.server.json"));

// tsconfigPaths.register({
// 	baseUrl: ".",
// 	cwd: "./tsconfig.server.json",
// 	paths: {
// 		"@/server/*": ["./src/*"],
// 	},
// });

export default defineConfig({
	entry: ["./src/**/*.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	bundle: false,
	splitting: false,
	sourcemap: false,
	minify: false,
	tsconfig: "./tsconfig.server.json",
	// esbuildPlugins: [
	// 	aliasPath({
	// 		alias: { "@/server": "./src" },
	// 	}),
	// ],
	esbuildOptions(options) {
		// Reemplazar el alias "@/server" por la ruta física
		options.plugins = [
			{
				name: "replace-alias",
				setup(build) {
					build.onResolve({ filter: /^@\/server\// }, (args) => {
						const resolvedPath = args.path.replace(
							/^@\/server\//,
							"./src/server/",
						);
						return { path: resolvedPath };
					});
				},
			},
		];
	},
});
