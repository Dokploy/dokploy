import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dokployApp = path.resolve(__dirname, "../dokploy");
const serverPkg = path.resolve(__dirname, "../../packages/server/src");

const wsPaths = [
	"/drawer-logs",
	"/docker-container-logs",
	"/docker-container-terminal",
	"/listen-deployment",
	"/listen-docker-stats-monitoring",
	"/terminal",
];

export default defineConfig({
	plugins: [tanstackStart(), react(), tailwindcss()],
	publicDir: path.resolve(dokployApp, "public"),
	resolve: {
		alias: [
			{
				find: /^@\/utils\/api$/,
				replacement: path.resolve(__dirname, "src/utils/api.ts"),
			},
			{
				find: /^next\/link$/,
				replacement: path.resolve(__dirname, "src/shims/next-link.tsx"),
			},
			{
				find: /^next\/router$/,
				replacement: path.resolve(__dirname, "src/shims/next-router.ts"),
			},
			{
				find: /^next\/navigation$/,
				replacement: path.resolve(__dirname, "src/shims/next-navigation.ts"),
			},
			{
				find: /^next\/head$/,
				replacement: path.resolve(__dirname, "src/shims/next-head.tsx"),
			},
			{
				find: /^next\/dynamic$/,
				replacement: path.resolve(__dirname, "src/shims/next-dynamic.tsx"),
			},
			{
				find: /^next\/script$/,
				replacement: path.resolve(__dirname, "src/shims/next-script.tsx"),
			},
			{
				find: /^nextjs-toploader$/,
				replacement: path.resolve(__dirname, "src/shims/toploader.tsx"),
			},
			{ find: /^~\//, replacement: `${path.resolve(__dirname, "src")}/` },
			{ find: /^@\//, replacement: `${dokployApp}/` },
			{ find: /^@dokploy\/server\//, replacement: `${serverPkg}/` },
			{
				find: /^@dokploy\/server$/,
				replacement: path.resolve(serverPkg, "index.ts"),
			},
		],
	},
	server: {
		port: 5173,
		proxy: {
			"/api": {
				target: "http://localhost:3000",
				headers: { origin: "http://localhost:3000" },
			},
			...Object.fromEntries(
				wsPaths.map((p) => [p, { target: "ws://localhost:3000", ws: true }]),
			),
		},
	},
});
