import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import { mysqlBackupClientImage } from "@dokploy/server/utils/backups/mysql-client";
import {
	getBackupCommand,
	getMysqlBackupCommand,
} from "@dokploy/server/utils/backups/utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "mysql-client-"));
const callsFile = join(directory, "calls.jsonl");
const sourceId = "a".repeat(64);
const helperId = "b".repeat(64);
const imageId = `sha256:${"c".repeat(64)}`;
const database = "compat'quote";
const password = "synthetic ' $password; value";

beforeAll(() => {
	const program = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const mode = process.env.TEST_MODE;
const sourceId = 'a'.repeat(64), helperId = 'b'.repeat(64), imageId = 'sha256:'+'c'.repeat(64);
const uuid = '12345678-1234-1234-1234-123456789abc';
fs.appendFileSync(process.env.TEST_CALLS, JSON.stringify({name,args,role:process.env.TEST_ROLE})+'\\n');
const output = value => process.stdout.write(value+'\\n');
if (name === 'docker') {
  const action = args.shift();
  if (action === 'ps') { output(sourceId); process.exit(0); }
  if (action === 'image') {
    if ((mode === 'missing-image' || mode === 'pull-failure') && !fs.existsSync(process.env.TEST_PULL)) process.exit(1);
    output(imageId); process.exit(0);
  }
  if (action === 'pull') {
    if (mode === 'pull-failure') process.exit(31);
    fs.writeFileSync(process.env.TEST_PULL, 'pulled'); output('pull progress'); process.exit(0);
  }
  if (action === 'create') { output(helperId); process.exit(0); }
  if (action === 'start') { output(helperId); process.exit(0); }
  if (action === 'rm') process.exit(mode === 'cleanup-failure' ? 32 : 0);
  if (action === 'inspect') {
    if (args.includes('{{.Id}}')) output(sourceId);
    else output((mode === 'wrong-image' ? 'sha256:'+'d'.repeat(64) : imageId)+' container:'+sourceId);
    process.exit(0);
  }
  if (action === 'exec') {
    const env = {...process.env};
    while (args[0] === '-e' || args[0] === '-i') {
      const option = args.shift();
      if (option === '-e') { const item=args.shift(), split=item.indexOf('='); env[item.slice(0,split)]=item.slice(split+1); }
    }
    env.TEST_ROLE = args.shift() === helperId ? 'helper' : 'source';
    const command = args.shift();
    if (command === 'gzip') {
      if (mode === 'gzip-failure') process.exit(34);
      const result=spawnSync('/usr/bin/gzip',args,{env,stdio:'inherit'}); process.exit(result.status ?? 1);
    }
    const result=spawnSync(command,args,{env,stdio:'inherit'}); process.exit(result.status ?? 1);
  }
  process.exit(90);
}
if (name === 'mysqldump') {
  if (args.includes('--version')) { output('mysqldump  Ver 9.7.4 for Linux on aarch64 (MySQL Community Server - GPL)'); process.exit(0); }
  const invalidTimeout = args.find(arg => arg === '--connect-timeout' || arg.startsWith('--connect-timeout='));
  if (invalidTimeout) { process.stderr.write("mysqldump: [ERROR] unknown variable '"+invalidTimeout.slice(2)+"'.\\n"); process.exit(2); }
  if (args.includes('--no-data')) {
    if (mode === 'native-success') process.exit(0);
    if (mode === 'other-error') { process.stderr.write('permission denied\\n'); process.exit(23); }
    const target=mode === 'wrong-identifier' ? 'other' : 'compat';
    process.stderr.write('mysqldump: [Warning] Using a password on the command line interface can be insecure.\\n');
    process.stderr.write("mysqldump: Couldn't execute 'use \u0060"+target+"\\\\'quote\u0060': Unknown database '"+target+"\\\\'quote' (1049)\\n");
    process.exit(2);
  }
  output(JSON.stringify(args));
  process.exit(mode === 'dump-failure' ? 33 : 0);
}
if (name === 'mysql') {
  if (process.env.TEST_ROLE === 'helper') {
    if (mode === 'auth-failure') { process.stderr.write('ERROR 1045 access denied\\n'); process.exit(1); }
    const line='8.4.11\\t'+(mode === 'wrong-server' ? '98765432-1234-1234-1234-123456789abc' : uuid)+'\\troot@%';
    if (mode === 'signal') { setTimeout(()=>output(line),10000); }
    else output(line);
  } else {
    output((mode === 'unsupported-version' ? '8.0.43' : '8.4.11')+'\\t'+uuid+'\\t'+(process.env.TEST_PORT || '3307')+'\\t'+(mode === 'socket-only' ? '1' : '0')+'\\troot@localhost');
  }
}
if (name === 'rclone') {
  if (args[0] === 'rcat') { if (mode === 'upload-failure') process.exit(35); fs.writeFileSync(process.env.TEST_ARCHIVE,fs.readFileSync(0)); }
  else if (args[0] === 'deletefile') fs.rmSync(process.env.TEST_ARCHIVE,{force:true});
  else process.exit(91);
}
`;
	for (const name of ["docker", "mysqldump", "mysql", "rclone"]) {
		writeFileSync(join(directory, name), program, { mode: 0o755 });
	}
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const environment = (mode: string, port?: string) => {
	writeFileSync(callsFile, "");
	rmSync(join(directory, "pulled"), { force: true });
	return {
		PATH: `${directory}:/usr/local/bin:/usr/bin:/bin`,
		TEST_MODE: mode,
		TEST_CALLS: callsFile,
		TEST_PULL: join(directory, "pulled"),
		TEST_ARCHIVE: join(directory, "archive.gz"),
		...(port === undefined ? {} : { TEST_PORT: port }),
	};
};

type Call = { name: string; args: string[]; role?: string };
const calls = (): Call[] =>
	readFileSync(callsFile, "utf8")
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
const dockerCalls = (action: string) =>
	calls().filter((call) => call.name === "docker" && call.args[0] === action);
const run = (mode = "fallback", name = database, port?: string) =>
	spawnSync("bash", ["-c", getMysqlBackupCommand(name, password)], {
		env: { ...environment(mode, port), CONTAINER_ID: sourceId },
		timeout: 5000,
	});
const dumpArgs = (data: Buffer) => {
	const uncompressed = spawnSync("gzip", ["-dc"], { input: data });
	expect(uncompressed.status).toBe(0);
	return JSON.parse(uncompressed.stdout.toString()) as string[];
};
const expectCleaned = () => {
	expect(dockerCalls("rm").map((call) => call.args)).toEqual([
		["rm", "-f", helperId],
	]);
};

describe("guarded MySQL backup client", () => {
	it("keeps ordinary backups native without a probe or image provisioning", () => {
		const result = run("fallback", "ordinary");
		expect(result.status).toBe(0);
		expect(dumpArgs(result.stdout).at(-1)).toBe("ordinary");
		expect(dockerCalls("exec")).toHaveLength(1);
		expect(dockerCalls("image")).toHaveLength(0);
	});

	it("keeps successful quoted-name probes on the native client", () => {
		const result = run("native-success");
		expect(result.status).toBe(0);
		expect(dumpArgs(result.stdout).at(-1)).toBe(database);
		expect(dockerCalls("exec")).toHaveLength(2);
		expect(dockerCalls("create")).toHaveLength(0);
	});

	it("selects the fixed client only after the exact native identifier failure", () => {
		const result = run();
		expect(result.status, result.stderr.toString()).toBe(0);
		const args = dumpArgs(result.stdout);
		expect(args).toContain("--no-defaults");
		expect(args).toContain("--ssl-mode=REQUIRED");
		for (const flag of [
			"--routines",
			"--events",
			"--single-transaction",
			"--no-tablespaces",
			"--quick",
			"--default-character-set=utf8mb4",
		]) {
			expect(args).toContain(flag);
		}
		expect(args.at(-1)).toBe(database);
		expectCleaned();
	});

	it("rejects a different identifier even when the error number is 1049", () => {
		const result = run("wrong-identifier");
		expect(result.status).toBe(2);
		expect(result.stdout.length).toBe(0);
		expect(dockerCalls("create")).toHaveLength(0);
	});

	it("propagates unrelated probe failures without a fallback or dump bytes", () => {
		const result = run("other-error");
		expect(result.status).toBe(23);
		expect(result.stderr.toString()).toContain("permission denied");
		expect(result.stdout.length).toBe(0);
		expect(dockerCalls("image")).toHaveLength(0);
	});

	it("preserves raw UTF8 names and credentials through the added shell layer", () => {
		const name = 'app\'s café $dollar; literal `text` \\"quoted\\"';
		const result = run("native-success", name);
		expect(result.status).toBe(0);
		const args = dumpArgs(result.stdout);
		expect(args.at(-1)).toBe(name);
		expect(args).toContain(`--password=${password}`);
	});

	it("uses the discovered internal port and rejects malformed port values", () => {
		const result = run();
		expect(result.status).toBe(0);
		expect(dumpArgs(result.stdout)).toContain("--port=3307");
		for (const port of ["0", "65536", "3307;echo bad"]) {
			const invalid = run("fallback", database, port);
			expect(invalid.status).toBe(1);
			expect(invalid.stderr.toString()).toContain("invalid source TCP port");
			expect(dockerCalls("create")).toHaveLength(0);
		}
	});

	it("rejects socket-only fallback without creating a helper", () => {
		const result = run("socket-only");
		expect(result.status).toBe(1);
		expect(result.stderr.toString()).toContain("socket-only source");
		expect(dockerCalls("create")).toHaveLength(0);
	});

	it("rejects unavailable TCP authentication and a different server identity", () => {
		for (const mode of ["auth-failure", "wrong-server"]) {
			const result = run(mode);
			expect(result.status).toBe(1);
			expect(result.stdout.length).toBe(0);
			expect(
				calls().filter(
					(call) =>
						call.name === "mysqldump" &&
						call.role === "helper" &&
						!call.args.includes("--version"),
				),
			).toHaveLength(0);
			expectCleaned();
		}
	});

	it("keeps the experimental server compatibility guard exact", () => {
		const result = run("unsupported-version");
		expect(result.status).toBe(1);
		expect(result.stderr.toString()).toContain(
			"only validated for MySQL 8.4.11",
		);
		expect(dockerCalls("image")).toHaveLength(0);
	});

	it("uses a cached immutable image or pulls that exact image once", () => {
		expect(run().status).toBe(0);
		expect(dockerCalls("pull")).toHaveLength(0);
		const result = run("missing-image");
		expect(result.status).toBe(0);
		expect(dockerCalls("pull").map((call) => call.args)).toEqual([
			["pull", mysqlBackupClientImage],
		]);
		expect(result.stderr.toString()).toContain("pull progress");
		expect(dumpArgs(result.stdout).at(-1)).toBe(database);
	});

	it("rejects image setup failures and mismatched helper identity", () => {
		const pull = run("pull-failure");
		expect(pull.status).toBe(1);
		expect(dockerCalls("pull")).toHaveLength(1);
		expect(dockerCalls("create")).toHaveLength(0);
		const mismatch = run("wrong-image");
		expect(mismatch.status).toBe(1);
		expect(mismatch.stdout.length).toBe(0);
		expectCleaned();
	});

	it("shares only the selected container network with bounded helper resources", () => {
		expect(run().status).toBe(0);
		const args = dockerCalls("create")[0]?.args ?? [];
		expect(args).toContain(`container:${sourceId}`);
		expect(args).toContain(imageId);
		expect(args).toContain("/var/lib/mysql:rw,size=64m");
		expect(args).toContain("512m");
		expect(args).toContain("128");
		for (const forbidden of [
			"--privileged",
			"--pid",
			"--volumes-from",
			"-v",
			"--mount",
			"-p",
		])
			expect(args).not.toContain(forbidden);
		expectCleaned();
	});

	it("propagates dump and gzip failures while cleaning the helper", () => {
		for (const [mode, exit] of [
			["dump-failure", 33],
			["gzip-failure", 34],
		] as const) {
			const result = run(mode);
			expect(result.status).toBe(exit);
			expectCleaned();
		}
	});

	it("surfaces cleanup failures and cleans the exact helper on termination", async () => {
		const result = run("cleanup-failure");
		expect(result.status).toBe(1);
		expect(result.stderr.toString()).toContain("cleanup failed");
		const child = spawn(
			"bash",
			["-c", getMysqlBackupCommand(database, password)],
			{
				env: { ...environment("signal"), CONTAINER_ID: sourceId },
				detached: true,
				stdio: "ignore",
			},
		);
		const closed = new Promise((resolve) => child.once("close", resolve));
		const deadline = Date.now() + 3000;
		while (
			!calls().some(
				(call) => call.name === "mysql" && call.role === "helper",
			) &&
			Date.now() < deadline
		)
			await new Promise((resolve) => setTimeout(resolve, 20));
		expect(child.pid).toBeDefined();
		process.kill(-(child.pid as number), "SIGTERM");
		await closed;
		expectCleaned();
	});

	it("passes discovered container identity without an inherited variable and uploads a complete archive", () => {
		for (const kind of ["database", "docker-compose", "stack"] as const) {
			const logPath = join(directory, `${kind}-success.log`);
			const backup = {
				backupType: kind === "database" ? "database" : "compose",
				databaseType: "mysql",
				database,
				mysql: { appName: "fixture", databaseRootPassword: password },
				compose: { appName: "fixture", composeType: kind },
				serviceName: "mysql",
				metadata: { mysql: { databaseRootPassword: password } },
			} as BackupSchedule;
			const env = environment("fallback");
			expect(Object.hasOwn(env, "CONTAINER_ID")).toBe(false);
			const result = spawnSync(
				"bash",
				["-c", getBackupCommand(backup, [], "synthetic/archive", logPath)],
				{ env, timeout: 5000 },
			);
			expect(result.status, result.stderr.toString()).toBe(0);
			expect(dockerCalls("exec")[0]?.args).toContain(sourceId);
			expect(dockerCalls("create")[0]?.args).toContain(`container:${sourceId}`);
			expect(dumpArgs(readFileSync(join(directory, "archive.gz"))).at(-1)).toBe(
				database,
			);
			expect(readFileSync(logPath, "utf8")).toContain("Backup done");
			expectCleaned();
		}
	});

	it("preserves full native/Compose/stack builders and removes failed uploads", () => {
		for (const kind of ["database", "docker-compose", "stack"] as const) {
			const logPath = join(directory, `${kind}.log`);
			const backup = {
				backupType: kind === "database" ? "database" : "compose",
				databaseType: "mysql",
				database,
				mysql: { appName: "fixture", databaseRootPassword: password },
				compose: { appName: "fixture", composeType: kind },
				serviceName: "mysql",
				metadata: { mysql: { databaseRootPassword: password } },
			} as BackupSchedule;
			const command = getBackupCommand(
				backup,
				[],
				"synthetic/archive",
				logPath,
			);
			const result = spawnSync("bash", ["-c", command], {
				env: environment("upload-failure"),
				timeout: 5000,
			});
			expect(result.status).toBe(1);
			expect(dockerCalls("ps")[0]?.args).toContain(
				kind === "database"
					? "label=com.docker.swarm.service.name=fixture"
					: kind === "stack"
						? "label=com.docker.stack.namespace=fixture"
						: "label=com.docker.compose.project=fixture",
			);
			expect(
				calls().some(
					(call) => call.name === "rclone" && call.args[0] === "deletefile",
				),
			).toBe(true);
			expect(readFileSync(logPath, "utf8")).not.toContain("Backup done");
			expectCleaned();
		}
	});
});
