import { execFile, execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
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
import {
	getGitCloneAuthConfig,
	getGitSubmoduleUpdateCommand,
} from "@dokploy/server/utils/providers/git-auth";
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

const runShell = (command: string, env: NodeJS.ProcessEnv) =>
	new Promise<void>((resolveCommand, rejectCommand) => {
		execFile("/bin/sh", ["-c", command], { env }, (error) => {
			if (error) {
				rejectCommand(error);
				return;
			}
			resolveCommand();
		});
	});

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
	it("fetches an authenticated private SSH submodule over HTTP", async () => {
		temporaryDirectory = mkdtempSync(join(tmpdir(), "dokploy-git-http-auth-"));
		const serverDirectory = join(temporaryDirectory, "server");
		const submoduleBare = join(serverDirectory, "org", "private.git");
		const submoduleWork = join(temporaryDirectory, "private-work");
		const applicationBare = join(serverDirectory, "org", "application.git");
		const applicationWork = join(temporaryDirectory, "application-work");
		const applicationClone = join(temporaryDirectory, "application-clone");

		initializeBareRepository(submoduleBare);
		initializeRepository(submoduleWork);
		commitReadme(submoduleWork, "private submodule\n");
		runGit(["-C", submoduleWork, "remote", "add", "origin", submoduleBare]);
		runGit(["-C", submoduleWork, "push", "-u", "origin", "main"]);
		runGit(["-C", submoduleBare, "update-server-info"]);

		initializeBareRepository(applicationBare);
		initializeRepository(applicationWork);
		runGit(
			[
				"-c",
				"protocol.file.allow=always",
				"submodule",
				"add",
				"--name",
				"private",
				pathToFileURL(submoduleBare).href,
				"deps/private",
			],
			applicationWork,
		);
		runGit(
			[
				"config",
				"--file",
				".gitmodules",
				"submodule.private.url",
				"ssh://git@git.example.test:2222/org/private.git",
			],
			applicationWork,
		);
		runGit(["add", ".gitmodules"], applicationWork);
		runGit(["commit", "-m", "Add private SSH submodule"], applicationWork);
		runGit(["-C", applicationWork, "remote", "add", "origin", applicationBare]);
		runGit(["-C", applicationWork, "push", "-u", "origin", "main"]);
		runGit(["-C", applicationBare, "update-server-info"]);

		const authorization = `Basic ${Buffer.from("dokploy:test-token").toString("base64")}`;
		const privateSubmoduleAuthHeaders: Array<string | undefined> = [];
		const httpServer = createServer((request, response) => {
			const requestUrl = new URL(request.url ?? "/", "http://localhost");
			const relativePath = decodeURIComponent(requestUrl.pathname.slice(1));
			const requestPath = requestUrl.pathname;

			if (relativePath.startsWith("org/private.git/")) {
				privateSubmoduleAuthHeaders.push(request.headers.authorization);
			}

			if (request.headers.authorization !== authorization) {
				response
					.writeHead(401, { "WWW-Authenticate": 'Basic realm="Git"' })
					.end();
				return;
			}

			const child = spawn("git", ["http-backend"], {
				env: {
					...process.env,
					GIT_PROJECT_ROOT: serverDirectory,
					GIT_HTTP_EXPORT_ALL: "1",
					PATH_INFO: requestPath,
					QUERY_STRING: requestUrl.search.slice(1),
					REQUEST_METHOD: request.method ?? "GET",
					CONTENT_TYPE:
						typeof request.headers["content-type"] === "string"
							? request.headers["content-type"]
							: "",
					CONTENT_LENGTH:
						typeof request.headers["content-length"] === "string"
							? request.headers["content-length"]
							: "0",
					HTTP_GIT_PROTOCOL:
						typeof request.headers["git-protocol"] === "string"
							? request.headers["git-protocol"]
							: "",
				},
			});
			const output: Buffer[] = [];
			child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
			child.stderr.resume();
			child.once("error", () => response.writeHead(500).end());
			child.once("close", (exitCode) => {
				if (response.writableEnded) return;
				const cgiOutput = Buffer.concat(output);
				const headerSeparator = cgiOutput.indexOf("\r\n\r\n");
				if (exitCode !== 0 || headerSeparator === -1) {
					response.writeHead(500).end();
					return;
				}

				const responseHeaders: Record<string, string> = {};
				let statusCode = 200;
				for (const line of cgiOutput
					.subarray(0, headerSeparator)
					.toString("utf8")
					.split("\r\n")) {
					const separator = line.indexOf(":");
					if (separator === -1) continue;
					const name = line.slice(0, separator);
					const value = line.slice(separator + 1).trim();
					if (name.toLowerCase() === "status") {
						statusCode = Number.parseInt(value, 10);
						continue;
					}
					responseHeaders[name] = value;
				}

				response.writeHead(statusCode, responseHeaders);
				response.end(cgiOutput.subarray(headerSeparator + 4));
			});
			request.pipe(child.stdin);
		});

		await new Promise<void>((resolveListen, rejectListen) => {
			httpServer.once("error", rejectListen);
			httpServer.listen(0, "127.0.0.1", resolveListen);
		});

		const address = httpServer.address();
		if (!address || typeof address === "string") {
			throw new Error("Failed to start local Git HTTP server");
		}

		const httpBaseUrl = `http://127.0.0.1:${address.port}`;
		const cloneConfig = getGitCloneAuthConfig({
			authorization: `Authorization: ${authorization}`,
			cloneBaseUrl: httpBaseUrl,
			enableSubmodules: true,
			sshHosts: ["git.example.test"],
		});
		const shellEnv = {
			...process.env,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
		};

		try {
			await runShell(
				`git ${cloneConfig} clone --branch main --depth 1 ${httpBaseUrl}/org/application.git ${applicationClone}`,
				shellEnv,
			);
			await runShell(
				getGitSubmoduleUpdateCommand({
					cloneBaseUrl: httpBaseUrl,
					gitCloneConfig: cloneConfig,
					outputPath: applicationClone,
					sshHosts: ["git.example.test"],
				}),
				shellEnv,
			);

			expect(
				readFileSync(join(applicationClone, "deps/private/README.md"), "utf8"),
			).toBe("private submodule\n");
			expect(privateSubmoduleAuthHeaders.length).toBeGreaterThan(0);
			expect(
				privateSubmoduleAuthHeaders.every((header) => header === authorization),
			).toBe(true);
		} finally {
			await new Promise<void>((resolveClose, rejectClose) => {
				httpServer.close((error) => {
					if (error) {
						rejectClose(error);
						return;
					}
					resolveClose();
				});
			});
		}
	});

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
