import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import packageInfo from "../../package.json";

const repoRoot = resolve(__dirname, "../../../..");
const readRepoFile = (path: string) =>
	readFileSync(join(repoRoot, path), "utf8");

describe("CTD candidate metadata", () => {
	it("identifies the adopted upstream release consistently", () => {
		expect(packageInfo.version).toBe("v0.29.14");
		expect(readRepoFile("openapi.json")).toContain('"version": "v0.29.14"');

		const dockerfile = readRepoFile("Dockerfile");
		expect(dockerfile).toContain("ARG RELEASE_TAG=latest");
		expect(dockerfile).toContain("org.opencontainers.image.version");
		expect(dockerfile).toContain("org.opencontainers.image.revision");
		expect(dockerfile).not.toContain("COPY .env");
		expect(readRepoFile("apps/dokploy/migration.ts")).toContain(
			"process.exitCode = 1",
		);
	});

	it("retains the GitHub Deployments permission in new app manifests", () => {
		const manifest = readRepoFile(
			"apps/dokploy/components/dashboard/settings/git/github/add-github-provider.tsx",
		);

		expect(manifest).toContain('deployments: "write"');
		expect(manifest).toContain('contents: "read"');
		expect(manifest).toContain('pull_requests: "write"');
		expect(manifest).toContain('"pull_request"');
		expect(manifest).toContain('"push"');
	});

	it("keeps registry publication behind manual workflow dispatch", () => {
		const workflow = readRepoFile(".github/workflows/ctd-image.yml");
		const triggers = parse(workflow).on;

		expect(Object.keys(triggers)).toEqual(["workflow_dispatch"]);
		expect(workflow).not.toMatch(/^\s{2}push:/m);
		expect(workflow).toContain("push: true");
		expect(workflow).toContain(
			"RELEASE_TAG=${{ steps.tags.outputs.tag_label }}",
		);
		expect(workflow).toContain("VCS_REF=${{ github.sha }}");
	});

	it("deploys only pinned tags and synchronizes RELEASE_TAG", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "dokploy-rollout-test-"));
		const sshLog = join(tempDir, "ssh.log");
		const fakeSsh = join(tempDir, "ssh");
		writeFileSync(fakeSsh, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$SSH_LOG"\n`);
		chmodSync(fakeSsh, 0o700);

		const result = spawnSync(
			"bash",
			[join(repoRoot, "bin/deploy-ctd.sh"), "v0.29.14-ctdabcdef0"],
			{
				encoding: "utf8",
				env: {
					...process.env,
					PATH: `${tempDir}:${process.env.PATH}`,
					SSH_LOG: sshLog,
				},
			},
		);

		expect(result.status).toBe(0);
		const calls = readFileSync(sshLog, "utf8");
		expect(calls).toContain("ghcr.io/budivoogt/dokploy:v0.29.14-ctdabcdef0");
		expect(calls).toContain("--env-add RELEASE_TAG=v0.29.14-ctdabcdef0");
		expect(calls).toContain("--update-order stop-first");
	});

	it("rejects mutable or shell-bearing tags before SSH", () => {
		const result = spawnSync(
			"bash",
			[join(repoRoot, "bin/deploy-ctd.sh"), "latest;echo unsafe"],
			{ encoding: "utf8" },
		);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Expected a pinned candidate tag");
	});

	it("rejects SSH option injection in target overrides", () => {
		const result = spawnSync(
			"bash",
			[join(repoRoot, "bin/deploy-ctd.sh"), "v0.29.14-ctdabcdef0"],
			{
				encoding: "utf8",
				env: { ...process.env, CTD_DOKPLOY_HOST: "-V" },
			},
		);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Invalid SSH target");
	});
});
