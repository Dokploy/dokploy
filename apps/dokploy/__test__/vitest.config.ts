import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["__test__/**/*.test.ts"], // Incluir solo los archivos de test en el directorio __test__
		exclude: ["**/node_modules/**", "**/dist/**", "**/.docker/**"],
		pool: "forks",
	},
	define: {
		"process.env": {
			NODE: "test",
		},
	},
	plugins: [tsconfigPaths()],
	resolve: {
		alias: {
			"@dokploy/server": path.resolve(
				__dirname,
				"../../../packages/server/src",
			),
		},
	},
});
