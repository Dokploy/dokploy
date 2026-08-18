import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCreateEnvFileCommand } from "@dokploy/server/utils/builders/compose";
import { afterAll, describe, expect, it } from "vitest";

// Real end-to-end: the same Environment Settings text must reach a *running*
// container with identical values under docker-compose and under swarm stack.
// Covers https://github.com/Dokploy/dokploy/issues/5095 and /5096.

// exactly what a user types in the Environment Settings tab
const uiEnv = [
	"SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0",
	"PASSWORD=mysecret#",
	"MIDDLE=sec#ret",
	"SHEBANG=#!secret",
	"DOLLARS=pa$$word",
	"SPACED=hello world",
	'JSON={"a":1}',
	"COMMENTED=value # a real comment",
	'QUOTED_HASH="abc#de"',
].join("\n");

const expected: Record<string, string> = {
	SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
	PASSWORD: "mysecret#",
	MIDDLE: "sec#ret",
	SHEBANG: "#!secret",
	DOLLARS: "pa$$word",
	SPACED: "hello world",
	JSON: '{"a":1}',
	COMMENTED: "value",
	QUOTED_HASH: "abc#de",
};

const keys = Object.keys(expected);
const composeApp = `env-delivery-c${process.pid}`;
const stackApp = `env-delivery-s${process.pid}`;
const pathFor = (app: string) =>
	join(process.cwd(), ".docker", "compose", app, "code");

const sh = (cmd: string, args: string[], cwd?: string) =>
	execFileSync(cmd, args, { cwd, encoding: "utf8" });

const setup = (
	app: string,
	composeType: "docker-compose" | "stack",
	svc: string,
) => {
	const codePath = pathFor(app);
	mkdirSync(codePath, { recursive: true });
	sh("bash", [
		"-c",
		getCreateEnvFileCommand({
			appName: app,
			composePath: "docker-compose.yml",
			composeType,
			env: uiEnv,
			randomize: false,
			suffix: "",
			serverId: null,
			environment: { project: { env: "" }, env: "" },
		} as Parameters<typeof getCreateEnvFileCommand>[0]),
	]);
	writeFileSync(join(codePath, "docker-compose.yml"), svc);
	return codePath;
};

// `printenv` per key, NUL-delimited so values keep their spaces and #
const dumpScript = keys.map((k) => `printf '%s\\0' "$${k}"`).join("; ");

const parseDump = (out: string) =>
	Object.fromEntries(
		out
			.split("\0")
			.slice(0, keys.length)
			.map((v, i) => [keys[i] as string, v]),
	);

afterAll(() => {
	try {
		sh("docker", ["stack", "rm", stackApp]);
	} catch {}
	try {
		sh("docker", ["compose", "down", "--remove-orphans"], pathFor(composeApp));
	} catch {}
	for (const app of [composeApp, stackApp]) {
		rmSync(join(process.cwd(), ".docker", "compose", app), {
			force: true,
			recursive: true,
		});
	}
});

describe("env delivery into a running container", () => {
	it("docker-compose: values survive compose-go interpolation", () => {
		const codePath = setup(
			composeApp,
			"docker-compose",
			"services:\n  app:\n    image: busybox\n    env_file: .env\n",
		);

		const out = sh(
			"docker",
			["compose", "run", "--rm", "-T", "app", "sh", "-c", dumpScript],
			codePath,
		);

		expect(parseDump(out)).toEqual(expected);
	}, 120000);

	it("swarm stack: values survive the literal env-file parser", () => {
		const codePath = setup(
			stackApp,
			"stack",
			"services:\n  app:\n    image: busybox\n    command: sleep 300\n    env_file: .env\n",
		);

		sh(
			"docker",
			["stack", "deploy", "-c", "docker-compose.yml", stackApp],
			codePath,
		);

		let containerId = "";
		for (let i = 0; i < 60 && !containerId; i++) {
			containerId = (
				sh("docker", [
					"ps",
					"--filter",
					`label=com.docker.swarm.service.name=${stackApp}_app`,
					"--format",
					"{{.ID}}",
				]).split("\n")[0] ?? ""
			).trim();
			if (!containerId) execFileSync("sleep", ["1"]);
		}
		expect(containerId, "swarm task never started").toBeTruthy();

		const out = sh("docker", ["exec", containerId, "sh", "-c", dumpScript]);

		expect(parseDump(out)).toEqual(expected);
	}, 180000);
});
