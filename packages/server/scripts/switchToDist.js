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
	"./utils/schedules/signed-job": {
		import: "./dist/utils/schedules/signed-job.js",
		require: "./dist/utils/schedules/signed-job.js",
	},
	"./utils/deployments/signed-job": {
		import: "./dist/utils/deployments/signed-job.js",
		require: "./dist/utils/deployments/signed-job.js",
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

fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log("Switched exports to use dist for production");
