import { execFileSync } from "node:child_process";
import {
	getWriteComposeSnapshotCommand,
	type SnapshotCompose,
} from "@dokploy/server/services/scaling/compose-snapshot";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { REAL_TEST_TIMEOUT, runRealSwarmTests } from "./real-swarm";

// The snippet runs on Linux servers; build its paths the way Linux would even
// when the tests run elsewhere.
vi.mock("node:path", async (importActual) => {
	const actual = await importActual<typeof import("node:path")>();
	return { ...actual.posix, default: actual.posix };
});

const IMAGE = "alpine:3.20";
const ROOT = "/etc/dokploy/compose/shop";

const compose = (
	overrides: Partial<SnapshotCompose> = {},
): SnapshotCompose => ({
	appName: "shop",
	serverId: "srv-1",
	sourceType: "github",
	composePath: "./deploy/docker-compose.yml",
	composeType: "docker-compose",
	createEnvFile: true,
	command: "",
	...overrides,
});

const runInLinux = (script: string) =>
	execFileSync("docker", ["run", "--rm", "-i", IMAGE, "sh", "-s"], {
		input: `set -e\n${script}`,
	}).toString();

describe.runIf(runRealSwarmTests)("snapshot shell snippet (real sh)", () => {
	beforeAll(() => {
		execFileSync("docker", ["pull", IMAGE]);
	}, REAL_TEST_TIMEOUT);

	it(
		"copies the deployed file, env and metadata into .dokploy",
		() => {
			const output = runInLinux(`
mkdir -p ${ROOT}/code/deploy
printf 'services:\\n  web:\\n    image: nginx\\n' > ${ROOT}/code/deploy/docker-compose.yml
printf "SECRET='a b'\\n" > ${ROOT}/code/deploy/.env
${getWriteComposeSnapshotCommand(compose(), false)}
ls -A ${ROOT}/.dokploy | tr '\\n' ' '; echo
cat ${ROOT}/.dokploy/meta.json; echo
cat ${ROOT}/.dokploy/compose.env
cat ${ROOT}/.dokploy/compose.yml
`);
			const [files, meta, ...rest] = output.split("\n");
			expect(files?.trim().split(" ").sort()).toEqual([
				"compose.env",
				"compose.yml",
				"meta.json",
			]);
			expect(JSON.parse(meta ?? "")).toEqual({
				version: 1,
				composeType: "docker-compose",
				projectDirectory: `${ROOT}/code/deploy`,
			});
			expect(rest.join("\n")).toContain("SECRET='a b'");
			expect(rest.join("\n")).toContain("image: nginx");
		},
		REAL_TEST_TIMEOUT,
	);

	it(
		"writes an empty env file when the deploy had none",
		() => {
			const output = runInLinux(`
mkdir -p ${ROOT}/code
printf 'services: {}\\n' > ${ROOT}/code/docker-compose.yml
${getWriteComposeSnapshotCommand(compose({ sourceType: "raw", createEnvFile: false }), false)}
wc -c < ${ROOT}/.dokploy/compose.env
`);
			expect(output.trim()).toBe("0");
		},
		REAL_TEST_TIMEOUT,
	);

	it(
		"removes an old snapshot when the compose switched to a custom command",
		() => {
			const output = runInLinux(`
mkdir -p ${ROOT}/.dokploy && touch ${ROOT}/.dokploy/meta.json
${getWriteComposeSnapshotCommand(compose({ command: "compose up -d" }), false)}
[ -e ${ROOT}/.dokploy ] && echo present || echo gone
`);
			expect(output.trim()).toBe("gone");
		},
		REAL_TEST_TIMEOUT,
	);
});
