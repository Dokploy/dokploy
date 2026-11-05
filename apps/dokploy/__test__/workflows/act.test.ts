import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	type ActRunInput,
	buildActArgs,
	buildActStartScript,
	buildActStatusScript,
	toDotenv,
} from "@dokploy/server/utils/workflows/act";
import { describe, expect, it } from "vitest";

const input: ActRunInput = {
	workflowRunId: "run123",
	event: "push",
	workflowPath: ".dokploy/workflows/ci.yml",
	eventPayload: { ref: "refs/heads/main" },
	secrets: { API_KEY: "s3cr3t" },
	variables: { REGION: "eu" },
	cloneUrl: "https://github.com/acme/app.git",
	token: "ghs_token",
	sha: "abcdef1234567890",
	ref: "refs/heads/main",
	branch: "main",
	actor: "octocat",
	defaultBranch: "main",
};

describe("toDotenv", () => {
	it("escapes values so godotenv reads them back verbatim", () => {
		expect(toDotenv({ A: 'say "hi"', B: "line1\nline2", C: "$HOME\\x" })).toBe(
			'A="say \\"hi\\""\nB="line1\\nline2"\nC="\\$HOME\\\\x"',
		);
	});
});

describe("buildActArgs", () => {
	it("passes the event, workflow file and run files to act", () => {
		const args = buildActArgs(input, "/run");
		expect(args.slice(0, 4)).toEqual([
			"act",
			"push",
			"-W",
			".dokploy/workflows/ci.yml",
		]);
		expect(args).toContain("--rm");
		expect(args).not.toContain("-j");
		expect(args.join(" ")).toContain("--secret-file /run/secrets.env");
	});

	it("targets a single job and a GitHub Enterprise instance", () => {
		const args = buildActArgs(
			{ ...input, targetJob: "build", githubInstance: "ghe.acme.com" },
			"/run",
		);
		expect(args.join(" ")).toContain("-j build");
		expect(args.join(" ")).toContain("--github-instance ghe.acme.com");
	});
});

describe("buildActStartScript", () => {
	it("never puts the token or secrets in plain text in the command", () => {
		const script = buildActStartScript(input);
		expect(script).not.toContain("ghs_token");
		expect(script).not.toContain("s3cr3t");
		expect(script).toContain("nohup setsid bash");
	});
});

describe("buildActStatusScript", () => {
	it("reports exit codes, running and lost runs", () => {
		const base = mkdtempSync(path.join(tmpdir(), "act-status-"));
		const script = buildActStatusScript(["done", "alive", "gone"]).replaceAll(
			"/etc/dokploy/workflows",
			base,
		);
		execFileSync("mkdir", ["-p", `${base}/done`, `${base}/alive`]);
		writeFileSync(`${base}/done/exit_code`, "3");
		writeFileSync(`${base}/alive/pid`, String(process.pid));

		const output = execFileSync("bash", ["-c", script]).toString().trim();
		expect(output.split("\n")).toEqual([
			"done 3",
			"alive running",
			"gone lost",
		]);
	});
});

describe("job script", () => {
	it("writes the exit code to the run directory after changing into the repo", () => {
		const script = buildActStartScript(input);
		const runSh = script
			.split("\n")
			.find((line) => line.includes("/run.sh") && line.includes("base64 -d"));
		const encoded = runSh
			?.match(/printf '%s' (\S+) \|/)?.[1]
			?.replace(/'/g, "");
		const content = Buffer.from(encoded ?? "", "base64").toString();
		expect(content).toContain(
			"mv /etc/dokploy/workflows/run123/exit_code.tmp /etc/dokploy/workflows/run123/exit_code",
		);
	});
});
