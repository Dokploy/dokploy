import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

type PackageManifest = {
	main?: string;
	exports?: Record<string, unknown>;
};

const serverDirectory = fileURLToPath(
	new URL("../../../packages/server/", import.meta.url),
);

test("switchToSrc preserves every package export", async () => {
	const fixtureDirectory = await fs.mkdtemp(
		path.join(os.tmpdir(), "dokploy-switch-to-src-"),
	);
	const scriptsDirectory = path.join(fixtureDirectory, "scripts");
	await fs.mkdir(scriptsDirectory);

	try {
		const packageManifest = JSON.parse(
			await fs.readFile(path.join(serverDirectory, "package.json"), "utf8"),
		) as PackageManifest;
		const scriptPath = path.join(scriptsDirectory, "switchToSrc.js");
		await fs.writeFile(
			path.join(fixtureDirectory, "package.json"),
			JSON.stringify(packageManifest),
		);
		await fs.copyFile(
			path.join(serverDirectory, "scripts", "switchToSrc.js"),
			scriptPath,
		);

		const result = spawnSync(process.execPath, [scriptPath], {
			cwd: fixtureDirectory,
			encoding: "utf8",
		});
		const switchedManifest = JSON.parse(
			await fs.readFile(path.join(fixtureDirectory, "package.json"), "utf8"),
		) as PackageManifest;

		expect(result.status).toBe(0);
		expect(switchedManifest.main).toBe("./src/index.ts");
		expect(switchedManifest.exports).toEqual(packageManifest.exports);
	} finally {
		await fs.rm(fixtureDirectory, { recursive: true, force: true });
	}
});
