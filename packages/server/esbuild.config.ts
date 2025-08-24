import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import alias from "esbuild-plugin-alias";

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename);

build({
	entryPoints: ["./src/**/*.ts"],
	// outfile: "./dist/index.js",
	outdir: "./dist",
	bundle: true,
	minify: false,
	platform: "node",
	target: "esnext",
	format: "esm",
	plugins: [
		alias({
			"@dokploy/server": path.resolve(__dirname, "src"),
		}),
	],
	packages: "external",
	// Opcional: si deseas emitir declaraciones de tipos con esbuild-plugin-dts
})
	.then(() => {
		console.log("Build successful");
	})
	.catch(() => process.exit(1));
