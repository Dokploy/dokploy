import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { apiCreateMariaDB } from "@dokploy/server/db/schema/mariadb";
import { apiCreateMongo } from "@dokploy/server/db/schema/mongo";
import { apiCreateMySql } from "@dokploy/server/db/schema/mysql";
import { apiCreatePostgres } from "@dokploy/server/db/schema/postgres";
import {
	DATABASE_PASSWORD_REGEX,
	DATABASE_USER_REGEX,
} from "@dokploy/server/db/schema/utils";
import {
	escapeJsLiteral,
	escapePostgresIdentifier,
	escapeSqlLiteral,
	execDockerArgv,
} from "@dokploy/server/utils/process/execAsync";
import { parse, quote } from "shell-quote";
import { afterAll, describe, expect, it } from "vitest";

const MARK = `/tmp/dokploy_dbcpwned_${process.pid}`;

afterAll(() => {
	if (existsSync(MARK)) rmSync(MARK);
});

const TOUCH = `\`touch ${MARK}\``;
const DOLLAR = `$(touch ${MARK})`;

const safe = (argv: string[]): boolean => {
	if (existsSync(MARK)) rmSync(MARK);
	const command = quote(["docker", ...argv]).replace(/^docker /, ": ");
	try {
		execSync(command, { shell: "/bin/bash", stdio: "ignore" });
	} catch {}
	const fired = existsSync(MARK);
	if (existsSync(MARK)) rmSync(MARK);
	return !fired;
};

const mysqlArgv = (user: string, pass: string, rootPw = "rootpw") => {
	const sql = `ALTER USER '${escapeSqlLiteral(user)}'@'%' IDENTIFIED BY '${escapeSqlLiteral(pass)}'; FLUSH PRIVILEGES;`;
	return ["exec", "cid", "mysql", "-u", "root", `-p${rootPw}`, "-e", sql];
};

const mariadbArgv = (user: string, pass: string, rootPw = "rootpw") => {
	const sql = `ALTER USER '${escapeSqlLiteral(user)}'@'%' IDENTIFIED BY '${escapeSqlLiteral(pass)}'; FLUSH PRIVILEGES;`;
	return ["exec", "cid", "mariadb", "-u", "root", `-p${rootPw}`, "-e", sql];
};

const postgresArgv = (user: string, pass: string) => {
	const sql = `ALTER USER "${escapePostgresIdentifier(user)}" WITH PASSWORD '${escapeSqlLiteral(pass)}';`;
	return ["exec", "cid", "psql", "-U", user, "-d", "postgres", "-c", sql];
};

const mongoArgv = (user: string, pass: string, currentPw = "currentpw") => {
	const evalExpr = `db.getSiblingDB('admin').changeUserPassword('${escapeJsLiteral(user)}', '${escapeJsLiteral(pass)}')`;
	return [
		"exec",
		"cid",
		"mongosh",
		"-u",
		user,
		"-p",
		currentPw,
		"--authenticationDatabase",
		"admin",
		"--eval",
		evalExpr,
	];
};

const redisArgv = (currentPw: string, pass: string) => [
	"exec",
	"cid",
	"redis-cli",
	"-a",
	currentPw,
	"CONFIG",
	"SET",
	"requirepass",
	pass,
];

describe("escape helpers", () => {
	it("escapeSqlLiteral doubles single quotes", () => {
		expect(escapeSqlLiteral("safe")).toBe("safe");
		expect(escapeSqlLiteral("O'Brien")).toBe("O''Brien");
		expect(escapeSqlLiteral("a'b'c")).toBe("a''b''c");
		expect(escapeSqlLiteral("no quotes here")).toBe("no quotes here");
	});

	it("escapePostgresIdentifier doubles double quotes", () => {
		expect(escapePostgresIdentifier("safe")).toBe("safe");
		expect(escapePostgresIdentifier('a"b')).toBe('a""b');
		expect(escapePostgresIdentifier('a"b"c')).toBe('a""b""c');
		expect(escapePostgresIdentifier("no double quotes")).toBe(
			"no double quotes",
		);
	});

	it("escapeJsLiteral escapes backslashes first then single quotes", () => {
		expect(escapeJsLiteral("safe")).toBe("safe");
		expect(escapeJsLiteral("a'b")).toBe("a\\'b");
		expect(escapeJsLiteral("a\\b")).toBe("a\\\\b");
		expect(escapeJsLiteral("a\\'b")).toBe("a\\\\\\'b");
		expect(escapeJsLiteral("a'b\\c")).toBe("a\\'b\\\\c");
	});
});

describe("DATABASE_PASSWORD_REGEX blocks shell-dangerous characters", () => {
	it("rejects backticks (command substitution)", () => {
		expect(DATABASE_PASSWORD_REGEX.test("a`b")).toBe(false);
		expect(DATABASE_PASSWORD_REGEX.test("`touch /tmp/x`")).toBe(false);
	});

	it("rejects other shell metacharacters", () => {
		expect(DATABASE_PASSWORD_REGEX.test("a$b")).toBe(false);
		expect(DATABASE_PASSWORD_REGEX.test("a'b")).toBe(false);
		expect(DATABASE_PASSWORD_REGEX.test('a"b')).toBe(false);
		expect(DATABASE_PASSWORD_REGEX.test("a!b")).toBe(false);
		expect(DATABASE_PASSWORD_REGEX.test("a b")).toBe(false);
		expect(DATABASE_PASSWORD_REGEX.test("a\\b")).toBe(false);
	});

	it("accepts safe passwords", () => {
		expect(DATABASE_PASSWORD_REGEX.test("SafePass123")).toBe(true);
		expect(DATABASE_PASSWORD_REGEX.test("P@ss#w0rd%")).toBe(true);
		expect(DATABASE_PASSWORD_REGEX.test("a~b")).toBe(true);
		expect(DATABASE_PASSWORD_REGEX.test("a^b&c*d")).toBe(true);
	});
});

describe("DATABASE_USER_REGEX restricts to safe characters", () => {
	it("accepts letters, numbers, underscores and hyphens", () => {
		expect(DATABASE_USER_REGEX.test("myuser")).toBe(true);
		expect(DATABASE_USER_REGEX.test("my_user")).toBe(true);
		expect(DATABASE_USER_REGEX.test("my-user")).toBe(true);
		expect(DATABASE_USER_REGEX.test("MyUser123")).toBe(true);
		expect(DATABASE_USER_REGEX.test("root")).toBe(true);
	});

	it("rejects shell metacharacters", () => {
		expect(DATABASE_USER_REGEX.test("my`user")).toBe(false);
		expect(DATABASE_USER_REGEX.test("my$user")).toBe(false);
		expect(DATABASE_USER_REGEX.test("my;user")).toBe(false);
		expect(DATABASE_USER_REGEX.test("my|user")).toBe(false);
		expect(DATABASE_USER_REGEX.test("my&user")).toBe(false);
		expect(DATABASE_USER_REGEX.test("my(user")).toBe(false);
		expect(DATABASE_USER_REGEX.test("my.user")).toBe(false);
		expect(DATABASE_USER_REGEX.test("my user")).toBe(false);
		expect(DATABASE_USER_REGEX.test("my'user")).toBe(false);
		expect(DATABASE_USER_REGEX.test('my"user')).toBe(false);
		expect(DATABASE_USER_REGEX.test("my!user")).toBe(false);
	});

	it("rejects empty strings", () => {
		expect(DATABASE_USER_REGEX.test("")).toBe(false);
	});
});

describe("database create schema rejects dangerous usernames", () => {
	const baseInput = {
		name: "test-service",
		databaseName: "testdb",
		databasePassword: "SafePass123",
		databaseRootPassword: "RootPass123",
		environmentId: "env-1",
		dockerImage: "mysql:8",
	};

	it("mysql rejects backtick in databaseUser", () => {
		const r = apiCreateMySql.safeParse({
			...baseInput,
			databaseUser: "my`touch /tmp/x`user",
		});
		expect(r.success).toBe(false);
	});

	it("mariadb rejects backtick in databaseUser", () => {
		const r = apiCreateMariaDB.safeParse({
			...baseInput,
			databaseUser: "my`touch /tmp/x`user",
		});
		expect(r.success).toBe(false);
	});

	it("postgres rejects backtick in databaseUser", () => {
		const r = apiCreatePostgres.safeParse({
			...baseInput,
			databaseUser: "my`touch /tmp/x`user",
		});
		expect(r.success).toBe(false);
	});

	it("mongo rejects backtick in databaseUser", () => {
		const r = apiCreateMongo.safeParse({
			...baseInput,
			databaseUser: "my`touch /tmp/x`user",
			replicaSets: false,
		});
		expect(r.success).toBe(false);
	});

	it("all accept a safe username", () => {
		expect(
			apiCreateMySql.safeParse({ ...baseInput, databaseUser: "myuser" })
				.success,
		).toBe(true);
		expect(
			apiCreateMariaDB.safeParse({ ...baseInput, databaseUser: "my-user" })
				.success,
		).toBe(true);
		expect(
			apiCreatePostgres.safeParse({ ...baseInput, databaseUser: "my_user" })
				.success,
		).toBe(true);
		expect(
			apiCreateMongo.safeParse({
				...baseInput,
				databaseUser: "myuser123",
				replicaSets: false,
			}).success,
		).toBe(true);
	});
});

describe("remote changePassword command is not injectable", () => {
	const cases: Array<[string, (u: string, p: string) => string[]]> = [
		["mysql (user)", (u, p) => mysqlArgv(u, p)],
		["mysql (root)", (u, p) => mysqlArgv("root", p, u)],
		["mariadb (user)", (u, p) => mariadbArgv(u, p)],
		["mariadb (root)", (u, p) => mariadbArgv("root", p, u)],
		["postgres (user as argv)", (u, p) => postgresArgv(u, p)],
		["postgres (user in sql)", (u, p) => postgresArgv(u, p)],
		["mongo (user in eval)", (u, p) => mongoArgv(u, p)],
		["mongo (pass in eval)", (_u, p) => mongoArgv("safeuser", p)],
		["redis (current pass as argv)", (u, p) => redisArgv(u, p)],
		["redis (new pass as argv)", (_u, p) => redisArgv("currentpw", p)],
	];

	for (const [label, build] of cases) {
		it(`${label} neutralizes backtick payloads`, () => {
			expect(safe(build(`a${TOUCH}b`, "pw"))).toBe(true);
			expect(safe(build("user", `a${TOUCH}b`))).toBe(true);
		});

		it(`${label} neutralizes $() payloads`, () => {
			expect(safe(build(`a${DOLLAR}b`, "pw"))).toBe(true);
			expect(safe(build("user", `a${DOLLAR}b`))).toBe(true);
		});
	}

	it("remote command preserves arguments intact (round-trip)", () => {
		const argv = mysqlArgv("myuser", "MyP@ss123");
		const cmd = quote(["docker", ...argv]);
		const parsed = parse(cmd);
		expect(parsed[0]).toBe("docker");
		expect(parsed[7]).toBe("-e");
		expect(parsed[8]).toBe(
			"ALTER USER 'myuser'@'%' IDENTIFIED BY 'MyP@ss123'; FLUSH PRIVILEGES;",
		);
	});

	it("postgres remote command preserves user identifier and password", () => {
		const argv = postgresArgv("myuser", "MyP@ss123");
		const cmd = quote(["docker", ...argv]);
		const parsed = parse(cmd);
		expect(parsed[5]).toBe("myuser");
		expect(parsed[9]).toBe("ALTER USER \"myuser\" WITH PASSWORD 'MyP@ss123';");
	});

	it("mongo remote command preserves eval expression", () => {
		const argv = mongoArgv("myuser", "MyP@ss123");
		const cmd = quote(["docker", ...argv]);
		const parsed = parse(cmd);
		const evalArg = parsed[parsed.length - 1];
		expect(evalArg).toBe(
			"db.getSiblingDB('admin').changeUserPassword('myuser', 'MyP@ss123')",
		);
	});
});

describe("local changePassword execution uses no shell", () => {
	it("backtick payload in local argv does not execute", async () => {
		if (existsSync(MARK)) rmSync(MARK);
		try {
			await execDockerArgv(null, [
				"exec",
				"no-such-container",
				"echo",
				`a${TOUCH}b`,
			]);
		} catch {
			// docker may be absent or container not found — both are fine
		}
		expect(existsSync(MARK)).toBe(false);
		if (existsSync(MARK)) rmSync(MARK);
	});

	it("undefined serverId still routes to execFile (no shell)", async () => {
		if (existsSync(MARK)) rmSync(MARK);
		try {
			await execDockerArgv(undefined, [
				"exec",
				"no-such-container",
				"echo",
				`a${TOUCH}b`,
			]);
		} catch {
			// expected
		}
		expect(existsSync(MARK)).toBe(false);
		if (existsSync(MARK)) rmSync(MARK);
	});
});

describe("raw interpolation (old bug) is detectable by this harness", () => {
	it("would fire when a backtick payload is NOT shell-quoted", () => {
		if (existsSync(MARK)) rmSync(MARK);
		const payload = `a${TOUCH}b`;
		const sql = `ALTER USER '${payload}'@'%' IDENTIFIED BY 'pw';`;
		const unsafe = `: exec cid mysql -u root -ppass -e "${sql}"`;
		try {
			execSync(unsafe, { shell: "/bin/bash", stdio: "ignore" });
		} catch {}
		expect(existsSync(MARK)).toBe(true);
		if (existsSync(MARK)) rmSync(MARK);
	});
});
