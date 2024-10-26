import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packagePath = path.resolve(__dirname, "../package.json");

// Leer el archivo package.json
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"));

// Modificar los exports
pkg.exports = {
	".": "./src/index.ts",
	"./db": {
		import: "./src/db/index.ts",
		require: "./dist/db/index.cjs.js",
	},
	"./setup/*": {
		import: "./src/setup/*.ts",
		require: "./dist/setup/index.cjs.js",
	},
	"./constants": {
		import: "./src/constants/index.ts",
		require: "./dist/constants.cjs.js",
	},
	"./dist": {
		import: "./dist/index.js",
		require: "./dist/index.cjs.js",
	},

	"./dist/db": {
		import: "./dist/db/index.js",
		require: "./dist/db/*.cjs",
	},
	"./dist/db/schema": {
		import: "./dist/db/schema/index.js",
		require: "./dist/db/schema/*.cjs",
	},
};

// Guardar los cambios en package.json
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
console.log("Switched exports to use src for development");
