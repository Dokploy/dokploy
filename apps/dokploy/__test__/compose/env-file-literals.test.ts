import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getCreateEnvFileCommand } from "@dokploy/server/utils/builders/compose";
import { afterEach, expect, test } from "vitest";

const appName = `env-file-literals-${process.pid}`;
const appPath = join(process.cwd(), ".docker", "compose", appName);

afterEach(() => rmSync(appPath, { force: true, recursive: true }));

test("writes special environment values literally", () => {
	mkdirSync(join(appPath, "code"), { recursive: true });

	const command = getCreateEnvFileCommand({
		appName,
		composePath: "docker-compose.yml",
		env: `PASSWORD=pa$$word
SPECIAL='!"#$%&/()=?'
JSON={"nested":{}}
MAIL_PASSWORD='"abc#de"'`,
		randomize: false,
		suffix: "",
		serverId: null,
		environment: { project: { env: "" }, env: "" },
	} as Parameters<typeof getCreateEnvFileCommand>[0]);

	execFileSync("bash", ["-c", command]);

	const output = readFileSync(join(appPath, "code", ".env"), "utf8");
	expect(output).toContain("PASSWORD=pa$$word");
	expect(output).toContain('SPECIAL=!"#$%&/()=?');
	expect(output).toContain('JSON={"nested":{}}');
	expect(output).toContain('MAIL_PASSWORD="abc#de"');
});
