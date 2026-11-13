import { execFile } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execPath, env as hostEnv } from "node:process";
import { promisify } from "node:util";
import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import { getHerokuCommand } from "@dokploy/server/utils/builders/heroku";
import { getNixpacksCommand } from "@dokploy/server/utils/builders/nixpacks";
import { getPaketoCommand } from "@dokploy/server/utils/builders/paketo";
import { getRailpackCommand } from "@dokploy/server/utils/builders/railpack";
import { createEnvFileCommand } from "@dokploy/server/utils/builders/utils";
import {
	getEnvironmentVariablesObject,
	prepareEnvironmentVariables,
} from "@dokploy/server/utils/docker/utils";
import { getBuildAppDirectory } from "@dokploy/server/utils/filesystem/directory";
import { createContentStaging } from "@dokploy/server/utils/filesystem/write-content";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ root: "" }));
vi.mock("@dokploy/server/constants", () => ({
	paths: (remote: boolean) => ({
		BASE_PATH: state.root,
		APPLICATIONS_PATH: join(state.root, remote ? "remote" : "local"),
	}),
}));

let staging: ReturnType<typeof createContentStaging>;
const app = (overrides = {}) =>
	({
		appName: "probe",
		sourceType: "git",
		customGitBuildPath: "",
		dockerfile: "Dockerfile",
		buildType: "dockerfile",
		serverId: null,
		buildServerId: null,
		env: "",
		buildArgs: "",
		buildSecrets: "",
		createEnvFile: false,
		cleanCache: false,
		publishDirectory: "",
		railpackVersion: "0.15.4",
		environment: {
			project: { env: "PROJECT=shared" },
			env: "SHARED=environment",
		},
		...overrides,
	}) as unknown as ApplicationNested;
const trace = () => join(state.root, "trace");
const bin = () => join(state.root, "bin");
const entries = (text: string) =>
	prepareEnvironmentVariables(text, "PROJECT=shared", "SHARED=environment");
const flags = (name: string, values: string[]) =>
	values.flatMap((value) => [name, value]);
const sorted = (value: Record<string, string>) =>
	JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
const builders = {
	docker: getDockerCommand,
	nixpacks: getNixpacksCommand,
	paketo: getPaketoCommand,
	heroku: getHerokuCommand,
	railpack: getRailpackCommand,
};
const special = `QUOTE="it's quoted"\nDOUBLE='say "hello"'\nDOLLAR='pa$$word'\nTICK='\`literal\`'\nMULTI="line1\nline2=a=b"\nUNICODE=é🙂\nEMPTY=\nDOT.KEY=dot\nDASH-KEY=dash\nDUP=first\nDUP=last\nSPACE="trailing "\nCOLLISION=argument-value\nDOCKER_HOST=tcp://only-a-build-value:1234\nREF=\${{project.PROJECT}}-\${{environment.SHARED}}`;

beforeEach(async () => {
	state.root = await mkdtemp(join(tmpdir(), "app-stream-"));
	staging = createContentStaging(null);
	await mkdir(bin());
	await mkdir(dirname(getBuildAppDirectory(app())), { recursive: true });
	const script = `#!${execPath}\nconst fs=require('node:fs'); const args=process.argv.slice(2); const name=require('node:path').basename(process.argv[1]); let values={}; let plain=[]; for(let i=0;i<args.length;i++){if(args[i]==='--env-file'){for(const line of fs.readFileSync(args[++i],'utf8').split('\\n')){const text=line.trim();if(text){const n=text.indexOf('=');values[text.slice(0,n)]=text.slice(n+1)}}}else if(args[i]==='--env'){const text=args[++i],n=text.indexOf('=');values[text.slice(0,n)]=text.slice(n+1)}else{plain.push(args[i])}} const keys=new Set(['SECRET','COLLISION','UID','DOCKER_HOST',...args.filter((arg,i)=>args[i-1]==='--secret').map(arg=>arg.match(/id=([^,]+)/)?.[1]).filter(Boolean)]);const env=Object.fromEntries([...keys].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));fs.appendFileSync(${JSON.stringify(trace())},JSON.stringify({name,args,plain,values,env})+'\\n');`;
	for (const name of ["docker", "pack", "nixpacks", "railpack"])
		await writeFile(join(bin(), name), script, { mode: 0o755 });
	await writeFile(join(bin(), "curl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
});
afterEach(async () => {
	await staging.cleanup();
	await rm(state.root, { recursive: true, force: true });
});
const run = (command: string) =>
	execAsync(`PATH=${quote([bin()])}:"$PATH"; ${command}`);
const runCanary = (binary: string, args: string[], environment = {}) =>
	promisify(execFile)(join(bin(), binary), args, {
		env: { ...hostEnv, ...environment },
	});
const records = async () =>
	(await readFile(trace(), "utf8"))
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));

describe("staged application build environment", () => {
	it.each([getPaketoCommand, getHerokuCommand])(
		"preserves Go's NEL whitespace without pack env-file trimming (case %#)",
		async (generate) => {
			const command = await generate(
				app({ env: 'NEL="literal\u0085"' }),
				staging,
			);
			expect(command).not.toContain("--env-file");
			await run(command);
			expect((await records())[0].values.NEL).toBe("literal\u0085");
		},
	);
	for (const [name, generate] of Object.entries(builders)) {
		it.each([
			"",
			special,
			Array.from(
				{ length: 900 },
				(_, i) => `V${i}=${"synthetic".repeat(24)}`,
			).join("\n"),
		])(
			`${name} preserves canary build inputs with bounded commands (case %#)`,
			async (text) => {
				const secrets =
					"SECRET='s$ecret `value`'\nCOLLISION=secret-value\nUID=1000";
				const value = app({
					buildType: name === "docker" ? "dockerfile" : name,
					env: text,
					buildArgs: text,
					buildSecrets: secrets,
				});
				const command = await generate(value, staging);
				expect(Buffer.byteLength(command)).toBeLessThan(5000);
				expect(command).not.toContain("synthetic");
				expect(command).not.toContain("pa$$word");
				expect(command).not.toContain("secret-value");
				const result = await run(command);
				expect(result.stdout + result.stderr).not.toContain("secret-value");
				expect(result.stdout + result.stderr).not.toContain("pa$$word");
				const all = await records();
				const actual = all.find((record) =>
					name === "docker"
						? record.args[0] === "build"
						: name === "railpack"
							? record.name === "railpack"
							: record.name === (name === "nixpacks" ? "nixpacks" : "pack"),
				);
				expect(actual).toBeDefined();
				if (name === "docker") {
					await runCanary(
						"docker",
						[
							"build",
							"-t",
							"probe",
							"-f",
							getBuildAppDirectory(value),
							`${dirname(getBuildAppDirectory(value))}/`,
							...flags("--build-arg", entries(text)),
							...Object.keys(getEnvironmentVariablesObject(secrets)).flatMap(
								(key) => ["--secret", `type=env,id=${key}`],
							),
						],
						getEnvironmentVariablesObject(secrets),
					);
					const before = (await records()).at(-1);
					expect(JSON.stringify(actual.args)).toBe(JSON.stringify(before.args));
					expect(actual.env).toEqual(before.env);
				} else {
					const expected = Object.fromEntries(
						entries(text).map((pair) => {
							const n = pair.indexOf("=");
							return [pair.slice(0, n), pair.slice(n + 1)];
						}),
					);
					expect(sorted(actual.values)).toBe(sorted(expected));
					const base =
						name === "nixpacks"
							? ["build", getBuildAppDirectory(value), "--name", "probe"]
							: name === "railpack"
								? [
										"prepare",
										getBuildAppDirectory(value),
										"--plan-out",
										`${getBuildAppDirectory(value)}/railpack-plan.json`,
										"--info-out",
										`${getBuildAppDirectory(value)}/railpack-info.json`,
									]
								: [
										"build",
										"probe",
										"--path",
										getBuildAppDirectory(value),
										"--builder",
										name === "paketo"
											? "paketobuildpacks/builder-jammy-full"
											: "heroku/builder:24",
									];
					await runCanary(
						name === "nixpacks"
							? "nixpacks"
							: name === "railpack"
								? "railpack"
								: "pack",
						[...base, ...flags("--env", entries(text))],
					);
					const before = (await records()).at(-1);
					expect(sorted(actual.values)).toBe(sorted(before.values));
					expect(actual.plain).toEqual(before.plain);
					expect(actual.env).toEqual(before.env);
					if (name === "railpack") {
						const build = all.find(
							(record) =>
								record.name === "docker" &&
								record.args[0] === "buildx" &&
								record.args[1] === "build",
						);
						expect(build).toBeDefined();
						for (const [key, val] of Object.entries(
							getEnvironmentVariablesObject(
								text,
								"PROJECT=shared",
								"SHARED=environment",
							),
						)) {
							expect(build.args).toContain(`id=${key},env=${key}`);
							expect(build.env[key]).toBe(val);
							expect(command).not.toContain(`${key}=${val}`);
						}
					}
				}
				await staging.cleanup();
				expect(
					await readdir(join(state.root, ".staging")).catch((error) => {
						if (error.code === "ENOENT") return [];
						throw error;
					}),
				).toEqual([]);
			},
			15000,
		);
	}
	it.each([false, true])(
		"uses the existing build-server path selection (remote=%s)",
		async (remote) => {
			const value = app({
				serverId: null,
				buildServerId: remote ? "builder" : null,
				env: "KEY=value",
				createEnvFile: true,
			});
			await mkdir(dirname(getBuildAppDirectory(value)), { recursive: true });
			await run(await getDockerCommand(value, staging));
			expect(
				await readFile(
					join(dirname(getBuildAppDirectory(value)), ".env"),
					"utf8",
				),
			).toBe("KEY=value");
		},
	);
	it.each(["", special, `BLOB=${"synthetic".repeat(21000)}`])(
		"stages byte-identical app .env outside the checkout (case %#)",
		async (text) => {
			const directory = getBuildAppDirectory(app());
			const command = await createEnvFileCommand(
				directory,
				text,
				staging,
				"PROJECT=shared",
				"SHARED=environment",
			);
			expect(Buffer.byteLength(command)).toBeLessThan(1024);
			expect(command).not.toContain("synthetic");
			await rm(dirname(directory), { recursive: true });
			await mkdir(dirname(directory), { recursive: true });
			await run(command);
			expect(await readFile(join(dirname(directory), ".env"), "utf8")).toBe(
				entries(text).join("\n"),
			);
		},
	);
	it.each([
		{ publishDirectory: "public", createEnvFile: true },
		{ publishDirectory: "", createEnvFile: false },
	])("does not write public or disabled .env (%j)", async (options) => {
		await run(
			await getDockerCommand(app({ ...options, env: "KEY=secret" }), staging),
		);
		expect(await readdir(dirname(getBuildAppDirectory(app())))).not.toContain(
			".env",
		);
	});
	it("fails before building when the env destination is not writable", async () => {
		await mkdir(join(dirname(getBuildAppDirectory(app())), ".env"));
		try {
			await expect(
				run(
					await getDockerCommand(
						app({ createEnvFile: true, env: "KEY=secret" }),
						staging,
					),
				),
			).rejects.toMatchObject({ exitCode: 1 });
		} finally {
			await staging.cleanup();
		}
		await expect(readFile(trace())).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readdir(join(state.root, ".staging"))).toEqual([]);
	});
	for (const [name, generate] of Object.entries(builders)) {
		it(`${name} propagates CLI failure and releases staged inputs`, async () => {
			const binary = name === "paketo" || name === "heroku" ? "pack" : name;
			await writeFile(join(bin(), binary), "#!/bin/sh\nexit 23\n", {
				mode: 0o755,
			});
			const value = app({
				buildType: name === "docker" ? "dockerfile" : name,
				env: "KEY=private-value",
				buildArgs: "KEY=private-value",
				buildSecrets: "SECRET=private-value",
			});
			try {
				await expect(run(await generate(value, staging))).rejects.toMatchObject(
					{ exitCode: 1 },
				);
			} finally {
				await staging.cleanup();
			}
			expect(await readdir(join(state.root, ".staging"))).toEqual([]);
		});
	}
});
