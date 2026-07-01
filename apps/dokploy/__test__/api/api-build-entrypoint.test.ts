import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../..",
);

const readJson = async <T>(path: string) =>
	JSON.parse(await readFile(resolve(repoRoot, path), "utf8")) as T;

describe("API build entrypoint", () => {
	it("starts from the emitted tsc output path", async () => {
		const packageJson = await readJson<{
			scripts: {
				start: string;
			};
		}>("apps/api/package.json");
		const tsconfig = await readJson<{
			compilerOptions: {
				outDir: string;
				rootDir: string;
			};
		}>("apps/api/tsconfig.json");

		expect(tsconfig.compilerOptions).toMatchObject({
			outDir: "dist",
			rootDir: "../..",
		});
		expect(packageJson.scripts.start).toBe("node dist/apps/api/src/index.js");
	});
});
