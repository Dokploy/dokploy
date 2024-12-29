import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["__test__/**/*.test.ts"],
		exclude: ["**/node_modules/**", "**/dist/**", "**/.docker/**"],
		pool: "forks",
	},
	define: {
		"process.env": {
			NODE: "test",
		},
	},
	resolve: {
		alias: {
			// "@dokploy/server": path.resolve(
			// 	__dirname,
			// 	"../../../packages/server/src",
			// ),
		},
	},
});
