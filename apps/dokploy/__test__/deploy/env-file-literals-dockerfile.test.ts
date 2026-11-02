import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createEnvFileCommand } from "@dokploy/server/utils/builders/utils";
import { parse } from "dotenv";
import { afterEach, describe, expect, it } from "vitest";

// Unlike compose's .env, this one is read by the app's own build tooling
// (generic dotenv, e.g. Next.js/Vite) — must stay unquoted, not Compose-escaped.
const appName = `env-file-literals-dockerfile-${process.pid}`;
const projectPath = join(process.cwd(), ".docker", "compose", appName);
const codePath = join(projectPath, "code");
const dockerFilePath = join(codePath, "Dockerfile");

afterEach(() => rmSync(projectPath, { force: true, recursive: true }));

const cases: Record<string, string> = {
	PASSWORD: "pa$$word",
	NESTED_JSON: '{"nested":{"a":1}}',
	QUOTE_INSIDE: 'she said "hi"',
	BACKSLASH: "back\\slash",
	UNICODE: "héllo wörld 日本語 🚀",
};

describe("createEnvFileCommand", () => {
	it("writes special environment values that a generic dotenv parser reads back literally", () => {
		mkdirSync(codePath, { recursive: true });

		const serviceEnv = Object.entries(cases)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n");

		const command = createEnvFileCommand(dockerFilePath, serviceEnv, "", "");
		execFileSync("bash", ["-c", command]);

		const written = readFileSync(join(codePath, ".env"), "utf8");
		const parsed = parse(written);

		for (const [key, value] of Object.entries(cases)) {
			expect(parsed[key], key).toBe(value);
		}
	});
});
