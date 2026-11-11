import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { prepareAzureDevopsClone } from "@dokploy/server/utils/providers/azure-devops";
import { AzureDevopsClient } from "@dokploy/server/utils/providers/azure-devops-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const token = "synthetic-submodule-token";
const authorization = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;

describe.skipIf(process.platform === "win32")(
	"Azure clone credentials with real HTTPS submodules",
	() => {
		let directory: string;
		let server: Server;
		let origin: string;
		let certificate: string;
		const requests: { path: string; authorized: boolean }[] = [];
		const gitEnv = {
			...process.env,
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_COUNT: "0",
			GIT_TERMINAL_PROMPT: "0",
		};
		const git = (args: string[], cwd?: string) =>
			run("git", args, { cwd, env: gitEnv });

		beforeAll(async () => {
			directory = await mkdtemp(join(tmpdir(), "dokploy-azure-https-"));
			certificate = join(directory, "certificate.pem");
			const key = join(directory, "key.pem");
			await run("openssl", [
				"req",
				"-x509",
				"-newkey",
				"rsa:2048",
				"-nodes",
				"-days",
				"1",
				"-subj",
				"/CN=localhost",
				"-addext",
				"subjectAltName=DNS:localhost",
				"-keyout",
				key,
				"-out",
				certificate,
			]);
			server = createServer(
				{ key: await readFile(key), cert: await readFile(certificate) },
				(request, response) => {
					const url = new URL(request.url || "/", origin);
					const authorized = request.headers.authorization === authorization;
					requests.push({ path: url.pathname, authorized });
					if (!authorized) {
						response.writeHead(401, {
							"WWW-Authenticate": 'Basic realm="fixture"',
						});
						response.end();
						return;
					}
					const chunks: Buffer[] = [];
					request.on("data", (chunk: Buffer) => chunks.push(chunk));
					request.on("end", () => {
						const input = Buffer.concat(chunks);
						const child = execFile(
							"git",
							["http-backend"],
							{
								env: {
									...gitEnv,
									GIT_PROJECT_ROOT: join(directory, "repositories"),
									GIT_HTTP_EXPORT_ALL: "1",
									PATH_INFO: url.pathname.replace(/^\/tfs\/Collection/, ""),
									REQUEST_METHOD: request.method || "GET",
									QUERY_STRING: url.search.slice(1),
									CONTENT_TYPE: request.headers["content-type"] || "",
									CONTENT_LENGTH: String(input.length),
									REMOTE_USER: "fixture",
								},
								encoding: "buffer",
							},
							(error, output) => {
								if (error) {
									response.writeHead(500);
									response.end();
									return;
								}
								const boundary = output.indexOf("\r\n\r\n");
								if (boundary < 0) {
									response.writeHead(500);
									response.end();
									return;
								}
								for (const line of output
									.subarray(0, boundary)
									.toString()
									.split("\r\n")) {
									const separator = line.indexOf(":");
									if (separator < 0) continue;
									const name = line.slice(0, separator);
									const value = line.slice(separator + 1).trim();
									if (name.toLowerCase() === "status")
										response.statusCode = Number.parseInt(value, 10);
									else response.setHeader(name, value);
								}
								response.end(output.subarray(boundary + 4));
							},
						);
						child.stdin?.end(input);
					});
				},
			);
			await new Promise<void>((resolve) =>
				server.listen(0, "127.0.0.1", resolve),
			);
			const address = server.address();
			if (!address || typeof address === "string")
				throw new Error("Missing fixture port");
			origin = `https://localhost:${address.port}`;
			const childRepo = join(directory, "child");
			await git(["init", "-b", "main", childRepo]);
			await writeFile(join(childRepo, "marker.txt"), "submodule checked out\n");
			await git(["add", "."], childRepo);
			await git(
				[
					"-c",
					"user.name=Fixture",
					"-c",
					"user.email=fixture@example.test",
					"commit",
					"-m",
					"fixture",
				],
				childRepo,
			);
			const { stdout: sha } = await git(["rev-parse", "HEAD"], childRepo);
			await git([
				"clone",
				"--bare",
				childRepo,
				join(directory, "repositories/project/_git/child"),
			]);
			for (const name of ["parent", "outside"]) {
				const parent = join(directory, name);
				await git(["init", "-b", "main", parent]);
				const collection =
					name === "outside" ? "OtherCollection" : "Collection";
				await writeFile(
					join(parent, ".gitmodules"),
					`[submodule "child"]\npath = modules/child\nurl = ${origin}/tfs/${collection}/project/_git/child\n`,
				);
				await git(["add", ".gitmodules"], parent);
				await git(
					[
						"update-index",
						"--add",
						"--cacheinfo",
						`160000,${sha.trim()},modules/child`,
					],
					parent,
				);
				await git(
					[
						"-c",
						"user.name=Fixture",
						"-c",
						"user.email=fixture@example.test",
						"commit",
						"-m",
						"fixture",
					],
					parent,
				);
				await git([
					"clone",
					"--bare",
					parent,
					join(directory, `repositories/project/_git/${name}`),
				]);
			}
		}, 30_000);

		afterAll(async () => {
			if (server)
				await new Promise<void>((resolve) => server.close(() => resolve()));
			if (directory) await rm(directory, { recursive: true, force: true });
		});

		const clone = async (name: string) => {
			const output = join(directory, `clone-${name}`);
			const plan = prepareAzureDevopsClone(
				{
					appName: "fixture",
					azureDevopsId: "provider",
					azureDevopsProjectId: "project",
					azureDevopsRepositoryId: "repository",
					azureDevopsBranch: "main",
					serverId: null,
					enableSubmodules: true,
					outputPathOverride: output,
				},
				new AzureDevopsClient(`${origin}/tfs/Collection`, token),
				`${origin}/tfs/Collection/project/_git/${name}`,
				token,
			);
			const result = await run("/bin/sh", ["-c", plan.command], {
				env: { ...gitEnv, ...plan.env, GIT_SSL_CAINFO: certificate },
				timeout: 20_000,
			});
			return { output, result };
		};

		it("authenticates a same-collection submodule without persisting credentials", async () => {
			const { output, result } = await clone("parent");
			expect(
				await readFile(join(output, "modules/child/marker.txt"), "utf8"),
			).toBe("submodule checked out\n");
			expect(
				requests.some(
					(request) =>
						request.path.includes("/_git/child/") && request.authorized,
				),
			).toBe(true);
			for (const value of [
				await readFile(join(output, ".git/config"), "utf8"),
				await readFile(join(output, ".git/modules/child/config"), "utf8"),
				result.stdout + result.stderr,
			]) {
				expect(value).not.toContain(token);
				expect(value).not.toContain(authorization);
				expect(value.toLowerCase()).not.toContain("extraheader");
			}
		}, 30_000);

		it("does not send the collection credential to an out-of-collection submodule", async () => {
			await expect(clone("outside")).rejects.toThrow();
			const outside = requests.filter((request) =>
				request.path.startsWith("/tfs/OtherCollection/"),
			);
			expect(outside.length).toBeGreaterThan(0);
			expect(outside.every((request) => !request.authorized)).toBe(true);
		}, 30_000);
	},
);
