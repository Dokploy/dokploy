import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../../../../", import.meta.url));
const fixture = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(`${app}/package.json`);
const vitestRequire = createRequire(require.resolve("vitest/package.json"));
const { createServer } = await import(vitestRequire.resolve("vite"));
const tailwind = require("@tailwindcss/postcss");

const server = await createServer({
	root: fixture,
	configFile: false,
	esbuild: { jsx: "automatic" },
	resolve: {
		alias: {
			"@": app,
			react: `${app}/node_modules/react`,
			"react-dom": `${app}/node_modules/react-dom`,
		},
		dedupe: ["react", "react-dom"],
	},
	css: { postcss: { plugins: [tailwind({ base: app })] } },
	server: {
		host: process.env.HOST ?? "127.0.0.1",
		port: 5178,
		strictPort: true,
		hmr: false,
		fs: { allow: [app] },
	},
});

await server.listen();
console.log(
	"Restoration log fixture: http://localhost:5178/?scenario=late-overlay",
);
