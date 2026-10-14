import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getGitSubmoduleUpdateCommand } from "@dokploy/server/utils/providers/git-auth";
import { afterEach, describe, expect, it } from "vitest";

let temporaryDirectory = "";

const runGit = (args: string[], cwd?: string) =>
	execFileSync("git", args, {
		cwd,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
		},
		encoding: "utf8",
	}).trim();

const configureRepository = (repositoryPath: string) => {
	runGit(["-C", repositoryPath, "config", "user.name", "Dokploy test"]);
	runGit(["-C", repositoryPath, "config", "user.email", "test@example.com"]);
};

const initializeBareRepository = (repositoryPath: string) => {
	mkdirSync(join(repositoryPath, ".."), { recursive: true });
	runGit(["init", "--bare", "--initial-branch=main", repositoryPath]);
};

const initializeRepository = (repositoryPath: string) => {
	runGit(["init", "--initial-branch=main", repositoryPath]);
	configureRepository(repositoryPath);
};

const commitReadme = (repositoryPath: string, content: string) => {
	writeFileSync(join(repositoryPath, "README.md"), content);
	runGit(["-C", repositoryPath, "add", "README.md"]);
	runGit(["-C", repositoryPath, "commit", "-m", "Add README"]);
};

afterEach(() => {
	if (temporaryDirectory) {
		rmSync(temporaryDirectory, { force: true, recursive: true });
	}
});

describe("Git submodule SSH URL rewriting", () => {
	it("rewrites custom SSH ports for nested submodules", () => {
		temporaryDirectory = mkdtempSync(join(tmpdir(), "dokploy-git-auth-"));
		const serverDirectory = join(temporaryDirectory, "server");
		const nestedBare = join(serverDirectory, "org", "nested.git");
		const nestedWork = join(temporaryDirectory, "nested-work");
		const libraryBare = join(serverDirectory, "org", "library.git");
		const libraryWork = join(temporaryDirectory, "library-work");
		const applicationWork = join(temporaryDirectory, "application-work");
		const applicationClone = join(temporaryDirectory, "application-clone");

		initializeBareRepository(nestedBare);
		initializeRepository(nestedWork);
		commitReadme(nestedWork, "nested submodule\n");
		runGit(["-C", nestedWork, "remote", "add", "origin", nestedBare]);
		runGit(["-C", nestedWork, "push", "-u", "origin", "main"]);

		initializeBareRepository(libraryBare);
		initializeRepository(libraryWork);
		commitReadme(libraryWork, "library submodule\n");
		runGit(["-C", libraryWork, "remote", "add", "origin", libraryBare]);
		runGit([
			"-C",
			libraryWork,
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			"--name",
			"nested",
			pathToFileURL(nestedBare).href,
			"deps/nested",
		]);
		runGit([
			"-C",
			libraryWork,
			"config",
			"--file",
			".gitmodules",
			"submodule.nested.url",
			"ssh://git@gitea.example.com:3333/org/nested.git",
		]);
		runGit(["-C", libraryWork, "add", ".gitmodules"]);
		runGit(["-C", libraryWork, "commit", "-m", "Add nested submodule"]);
		runGit(["-C", libraryWork, "push", "origin", "main"]);

		initializeRepository(applicationWork);
		runGit([
			"-C",
			applicationWork,
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			"--name",
			"library",
			pathToFileURL(libraryBare).href,
			"deps/library",
		]);
		runGit([
			"-C",
			applicationWork,
			"config",
			"--file",
			".gitmodules",
			"submodule.library.url",
			"ssh://git@gitea.example.com:2222/org/library.git",
		]);
		runGit(["-C", applicationWork, "add", ".gitmodules"]);
		runGit(["-C", applicationWork, "commit", "-m", "Add library submodule"]);
		runGit([
			"clone",
			"--depth",
			"1",
			"--no-recurse-submodules",
			applicationWork,
			applicationClone,
		]);

		const command = getGitSubmoduleUpdateCommand({
			cloneBaseUrl: pathToFileURL(serverDirectory).href,
			gitCloneConfig: "-c protocol.file.allow=always",
			outputPath: applicationClone,
			sshHosts: ["gitea.example.com"],
		});
		execFileSync("/bin/sh", ["-c", command], {
			env: {
				...process.env,
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_NOSYSTEM: "1",
			},
		});

		expect(
			readFileSync(
				join(applicationClone, "deps/library/deps/nested/README.md"),
				"utf8",
			),
		).toBe("nested submodule\n");
	});
});
