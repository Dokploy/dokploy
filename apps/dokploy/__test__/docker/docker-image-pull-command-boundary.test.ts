import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRemoteDocker } from "@dokploy/server/utils/providers/docker";
import { describe, expect, it } from "vitest";

const quoteShellArg = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../..",
);

const readRepoFile = (repoPath: string) =>
	readFileSync(path.join(repoRoot, repoPath), "utf8");

describe("Docker image pull command boundary", () => {
	it("quotes application Docker provider image names in pull scripts", async () => {
		const dockerImage = "registry.local/team/app:1; touch /tmp/pwn";

		const command = await buildRemoteDocker({
			dockerImage,
			registryUrl: "",
			username: "",
			password: "",
		} as never);

		expect(command).toContain(
			`echo ${quoteShellArg(`Pulling ${dockerImage}`)};`,
		);
		expect(command).toContain(
			`docker pull ${quoteShellArg(dockerImage)} 2>&1 ||`,
		);
		expect(command).not.toContain(`echo "Pulling ${dockerImage}"`);
		expect(command).not.toContain(`docker pull ${dockerImage} 2>&1`);
	});

	it("does not interpolate database dockerImage fields into remote pull shell text", () => {
		const databaseServices = [
			"packages/server/src/services/postgres.ts",
			"packages/server/src/services/mysql.ts",
			"packages/server/src/services/mongo.ts",
			"packages/server/src/services/redis.ts",
			"packages/server/src/services/libsql.ts",
			"packages/server/src/services/mariadb.ts",
		];

		for (const servicePath of databaseServices) {
			const source = readRepoFile(servicePath);

			expect(source).toContain("buildDockerPullCommand(");
			expect(source).not.toMatch(/`docker pull \$\{[^}]+\.dockerImage\}`/);
		}
	});
});
