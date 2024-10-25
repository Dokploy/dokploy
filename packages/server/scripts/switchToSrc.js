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
};

// Guardar los cambios en package.json
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
console.log("Switched exports to use src for development");
