import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCreateEnvFileCommand } from "@dokploy/server/utils/builders/compose";
import { prepareEnvironmentVariablesForFile } from "@dokploy/server/utils/docker/utils";
import { afterEach, describe, expect, it } from "vitest";

// https://github.com/Dokploy/dokploy/issues/5096 — compose-go interpolates the
// generated .env, docker stack deploy reads it literally; quoting cannot serve both.

const appName = `env-file-compose-type-${process.pid}`;
const projectPath = join(process.cwd(), ".docker", "compose", appName);
const codePath = join(projectPath, "code");

afterEach(() => {
	rmSync(projectPath, { force: true, recursive: true });
});

const buildEnvFile = (composeType: "docker-compose" | "stack", env: string) => {
	mkdirSync(codePath, { recursive: true });
	const command = getCreateEnvFileCommand({
		appName,
		composePath: "docker-compose.yml",
		composeType,
		env,
		randomize: false,
		suffix: "",
		serverId: null,
		environment: { project: { env: "" }, env: "" },
	} as Parameters<typeof getCreateEnvFileCommand>[0]);
	execFileSync("bash", ["-c", command]);
	return readFileSync(join(codePath, ".env"), "utf8");
};

describe("prepareEnvironmentVariablesForFile", () => {
	const env = "DSN=https://key@o0.io/0\nPASSWORD=pa$$word";

	it("quotes and escapes by default, for the docker-compose .env", () => {
		expect(prepareEnvironmentVariablesForFile(env, "", "")).toEqual([
			'DSN="https://key@o0.io/0"',
			'PASSWORD="pa\\$\\$word"',
		]);
	});

	it("writes values untouched when raw", () => {
		expect(prepareEnvironmentVariablesForFile(env, "", "", true)).toEqual([
			"DSN=https://key@o0.io/0",
			"PASSWORD=pa$$word",
		]);
	});
});

describe("getCreateEnvFileCommand", () => {
	it("writes a stack .env that docker reads back without the wrapping quotes", () => {
		const contents = buildEnvFile("stack", "DSN=https://key@o0.io/0");
		expect(contents).toContain("DSN=https://key@o0.io/0");
		expect(contents).not.toContain('DSN="');

		writeFileSync(
			join(codePath, "docker-compose.yml"),
			"services:\n  test:\n    image: busybox\n    env_file: .env\n",
		);

		const rendered = execFileSync(
			"docker",
			["stack", "config", "-c", "docker-compose.yml"],
			{ cwd: codePath, encoding: "utf8" },
		);

		expect(rendered).toContain("DSN: https://key@o0.io/0");
		// #5096 symptom: quotes surviving into the value
		expect(rendered).not.toContain("DSN: '\"");
	}, 60000);

	it("keeps quoting the docker-compose .env so $ survives interpolation", () => {
		const contents = buildEnvFile("docker-compose", "PASSWORD=pa$$word");
		expect(contents).toContain('PASSWORD="pa\\$\\$word"');
	});
});
