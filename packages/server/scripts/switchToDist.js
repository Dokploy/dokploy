import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packagePath = path.resolve(__dirname, "../package.json");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"));

pkg.main = "./dist/index.js";

pkg.exports = {
	".": {
		import: "./dist/index.js",
		require: "./dist/index.cjs.js",
	},
	"./db": {
		import: "./dist/db/index.js",
		require: "./dist/db/index.cjs.js",
	},
	"./db/schema": {
		import: "./dist/db/schema/index.js",
		require: "./dist/db/schema/index.js",
	},
	"./db/*": {
		import: "./dist/db/*.js",
		require: "./dist/db/*.js",
	},
	"./setup/*": {
		import: "./dist/setup/*.js",
		require: "./dist/setup/*.js",
	},
	"./services/*": {
		import: "./dist/services/*.js",
		require: "./dist/services/*.js",
	},
	"./lib/*": {
		import: "./dist/lib/*.js",
		require: "./dist/lib/*.js",
	},
	"./utils/*": {
		import: "./dist/utils/*.js",
		require: "./dist/utils/*.js",
	},
	"./monitoring/*": {
		import: "./dist/monitoring/*.js",
		require: "./dist/monitoring/*.js",
	},
	"./emails/*": {
		import: "./dist/emails/*.js",
		require: "./dist/emails/*.js",
	},
	"./templates": {
		import: "./dist/templates/index.js",
		require: "./dist/templates/index.js",
	},
	"./types/*": {
		import: "./dist/types/*.js",
		require: "./dist/types/*.js",
	},
	"./wss/*": {
		import: "./dist/wss/*.js",
		require: "./dist/wss/*.js",
	},
	"./constants": {
		import: "./dist/constants/index.js",
		require: "./dist/constants/index.js",
	},
	"./*": {
		import: "./dist/*",
		require: "./dist/*.cjs",
	},
	"./dist": {
		import: "./dist/index.js",
		require: "./dist/index.cjs.js",
	},
	"./dist/db": {
		import: "./dist/db/index.js",
		require: "./dist/db/index.cjs.js",
	},
	"./dist/db/schema": {
		import: "./dist/db/schema/index.js",
		require: "./dist/db/schema/index.cjs.js",
	},
};

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
console.log("Switched exports to use dist for production");
