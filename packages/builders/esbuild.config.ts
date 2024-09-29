import esbuild from "esbuild";

try {
	esbuild
		.build({
			entryPoints: ["./src/**/*.ts"],
			bundle: true,
			platform: "node",
			format: "cjs",
			target: "node18",
			outExtension: { ".js": ".js" },
			minify: true,
			outdir: "dist",
			tsconfig: "tsconfig.server.json",
			packages: "external",
			alias: {
				"@/server": "./src",
			},
		})
		.catch(() => {
			return process.exit(1);
		});
} catch (error) {
	console.log(error);
}
