import { build } from "esbuild";
import path from "node:path";

build({
	entryPoints: ["./src/**/*.ts", "./src/**/*.tsx"], // Punto de entrada principal de tu aplicación
	outdir: "dist",
	bundle: false, // Cambia a true si deseas bundlear tu código
	platform: "node",
	format: "esm",
	target: ["esnext"],
	sourcemap: false,
	tsconfig: "./tsconfig.server.json",
	plugins: [
		// TsconfigPathsPlugin({ tsconfig: "./tsconfig.server.json" }),
		{
			name: "AddJsExtensions",
			setup(build) {
				build.onResolve({ filter: /.*/ }, (args) => {
					if (args.path.startsWith(".") && !path.extname(args.path)) {
						return { path: `${args.path}.js` };
					}
				});
			},
		},
	],
}).catch(() => process.exit(1));
