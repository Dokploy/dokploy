import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packagePath = path.resolve(__dirname, "../package.json");

// Leer el archivo package.json
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"));

pkg.main = "./src/index.ts";

// Modificar los exports
pkg.exports = {
	".": "./src/index.ts",
	"./db": {
		import: "./src/db/index.ts",
		require: "./dist/db/index.cjs.js",
	},
	"./db/schema": {
		import: "./src/db/schema/index.ts",
		require: "./dist/db/schema/index.js",
	},
	"./db/*": {
		import: "./src/db/*.ts",
		require: "./dist/db/*.js",
	},
	"./setup/*": {
		import: "./src/setup/*.ts",
		require: "./dist/setup/index.cjs.js",
	},
	"./services/*": {
		import: "./src/services/*.ts",
		require: "./dist/services/*.js",
	},
	"./lib/*": {
		import: "./src/lib/*.ts",
		require: "./dist/lib/*.js",
	},
	"./utils/*": {
		import: "./src/utils/*.ts",
		require: "./dist/utils/*.js",
	},
	"./monitoring/*": {
		import: "./src/monitoring/*.ts",
		require: "./dist/monitoring/*.js",
	},
	"./emails/*": {
		import: "./src/emails/*.ts",
		require: "./dist/emails/*.js",
	},
	"./templates": {
		import: "./src/templates/index.ts",
		require: "./dist/templates/index.js",
	},
	"./types/*": {
		import: "./src/types/*.ts",
		require: "./dist/types/*.js",
	},
	"./wss/*": {
		import: "./src/wss/*.ts",
		require: "./dist/wss/*.js",
	},
	"./constants": {
		import: "./src/constants/index.ts",
		require: "./dist/constants.cjs.js",
	},
};

// Guardar los cambios en package.json
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
console.log("Switched exports to use src for development");
