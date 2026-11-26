import { afterEach, describe, expect, it, vi } from "vitest";

const constants = vi.hoisted(() => ({ IS_CLOUD: true }));

vi.mock("@dokploy/server/constants", async (importOriginal) => ({
	...(await importOriginal<object>()),
	get IS_CLOUD() {
		return constants.IS_CLOUD;
	},
}));

import {
	emitAuditEvent,
	redactAuditValue,
	redactCommand,
	requestAuditFields,
	requestNetworkFields,
} from "@dokploy/server/lib/audit-stream";
import {
	SENSITIVE_QUERY_PATHS,
	shouldAuditProcedure,
} from "@/server/api/utils/audit";

describe("redactAuditValue", () => {
	it("keeps only the origin of endpoints and hides free-form flags", () => {
		expect(
			redactAuditValue({
				endpoint: "https://hooks.example.com/services/T0/B0/abcdSECRET",
				additionalFlags: ["--s3-secret-access-key=xyz"],
				extraConfig: { header: "x" },
			}),
		).toEqual({
			endpoint: "https://hooks.example.com/[redacted]",
			additionalFlags: "[redacted]",
			extraConfig: "[redacted]",
		});
	});

	it("redacts secret-looking keys at any depth and keeps ids", () => {
		expect(
			redactAuditValue({
				name: "prod",
				password: "hunter2",
				apiKey: "sk-ant-123",
				sshKeyId: "abc",
				registryIds: ["r1"],
				nested: { databasePassword: "x", accessToken: "y", env: "A=1" },
				list: [{ secretAccessKey: "z", region: "eu" }],
			}),
		).toEqual({
			name: "prod",
			password: "[redacted]",
			apiKey: "[redacted]",
			sshKeyId: "abc",
			registryIds: ["r1"],
			nested: {
				databasePassword: "[redacted]",
				accessToken: "[redacted]",
				env: "[redacted]",
			},
			list: [{ secretAccessKey: "[redacted]", region: "eu" }],
		});
	});

	it("keeps empty secret values so a cleared field is visible", () => {
		expect(redactAuditValue({ password: "", token: null })).toEqual({
			password: "",
			token: null,
		});
	});

	it("redacts PEM blocks under any key and collapses long strings", () => {
		expect(
			redactAuditValue({
				content: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc",
				description: "a".repeat(3000),
			}),
		).toEqual({ content: "[redacted]", description: "[3000 chars]" });
	});

	it("covers real Dokploy input fields that carry secrets", () => {
		expect(
			redactAuditValue({
				composeFile: "services:\n  db:\n    environment: [POSTGRES_PASSWORD=x]",
				previewEnv: "A=1",
				envVariables: [{ key: "A", value: "1" }],
				applicationKey: "ovh",
				userKey: "pushover",
				content: "file body",
				traefikConfig: "http: {}",
				headers: '{"X-Api-Key":"k"}',
				"X-Api-Key": "k",
				name: "keep-me",
			}),
		).toEqual({
			composeFile: "[redacted]",
			previewEnv: "[redacted]",
			envVariables: "[redacted]",
			applicationKey: "[redacted]",
			userKey: "[redacted]",
			content: "[redacted]",
			traefikConfig: "[redacted]",
			headers: "[redacted]",
			"X-Api-Key": "[redacted]",
			name: "keep-me",
		});
	});

	it("strips credentials and query strings from URLs", () => {
		expect(
			redactAuditValue({
				customGitUrl: "https://user:ghp_secret@github.com/org/repo.git",
				endpoint: "https://hooks.example.com/notify?token=abc",
				apiUrl: "https://api.openai.com/v1",
			}),
		).toEqual({
			customGitUrl: "https://[redacted]@github.com/org/repo.git",
			endpoint: "https://hooks.example.com/[redacted]",
			apiUrl: "https://api.openai.com/v1",
		});
	});

	it("reduces uploaded files to name and size", () => {
		const form = new FormData();
		form.append("file", new File(["hello"], "a.txt"));
		form.append("destinationPath", "/app");
		expect(redactAuditValue(form)).toEqual({
			file: { name: "a.txt", size: 5 },
			destinationPath: "/app",
		});
	});
});

describe("redactCommand", () => {
	it("scrubs inline credentials from shell commands", () => {
		const out = redactCommand(
			"curl -H 'Authorization: Bearer sk-live-abc' --password=hunter2 https://u:p4ss@x.io/a && PGPASSWORD=s3cr3t psql -U app",
		);
		for (const secret of ["sk-live-abc", "hunter2", "p4ss", "s3cr3t"]) {
			expect(out).not.toContain(secret);
		}
		expect(out).toContain("psql -U app");
		expect(redactCommand("ls -la /app")).toBe("ls -la /app");
		for (const cmd of [
			"curl -u alice:hunter2 https://x.io",
			"curl -u sk_live_hunter2: https://x.io",
			"curl -u :hunter2 https://x.io",
			'curl -u "alice:hunter2 horse" https://x.io',
			"curl --proxy-user p:hunter2 https://x.io",
			"git clone https://hunter2@github.com/org/repo",
			"mysql -uroot -phunter2 -e 'select 1'",
			"sshpass -p hunter2 ssh root@host",
			"redis-cli -h db -a hunter2 ping",
			"curl -H 'Cookie: session=hunter2' https://x.io",
			"curl --cookie 'session=hunter2' https://x.io",
			"curl -b 'session=hunter2' https://x.io",
			"curl -H 'Cookie: session=\"hunter2\"' https://x.io",
			"curl -H 'X-Api-Key: hunter2' https://x.io",
			"docker login -p hunter2 registry.example.com",
			"mysql -uroot -p123hunter2 -e 'select 1'",
			"mongosh -u root -p hunter2 --authenticationDatabase admin",
			"valkey-cli -a hunter2 ping",
			'mysql -uroot -e "select 1;" -phunter2 db',
			"PASSWORD=$'hunter2' cmd",
			"mysqldump -phun\\'ter2hunter2 db",
			'tool --token="abc"hunter2',
			"curl -bsession=hunter2 https://x.io",
			"tool --authpw hunter2",
		]) {
			expect(redactCommand(cmd)).not.toContain("hunter2");
		}
		expect(redactCommand("psql -U app")).toBe("psql -U app");
		expect(redactCommand("ssh -p 22 root@host")).toBe("ssh -p 22 root@host");
		expect(redactCommand("docker run -p 80:80 nginx")).toBe(
			"docker run -p 80:80 nginx",
		);
		expect(redactCommand("mkdir -p /app")).toBe("mkdir -p /app");
		for (const cmd of [
			"find . -path ./x -print",
			"docker run -p80:80 nginx",
			"git checkout -b feature",
			"docker run --name mongo -p 27017:27017 mongo:7",
			"mongo -h auth-db:27017 app",
			"mongosh --authenticationDatabase admin",
		]) {
			expect(redactCommand(cmd)).toBe(cmd);
		}
		expect(redactCommand("redis-cli -a hunter2; ls -a /x")).toBe(
			"redis-cli -a [redacted]; ls -a /x",
		);
		expect(redactCommand("curl -H Cookie:session=x https://x.io/path")).toBe(
			"curl -H Cookie:[redacted] https://x.io/path",
		);
		expect(
			redactCommand(
				"mongosh -u root -p hunter2 --authenticationDatabase admin",
			),
		).toBe("mongosh -u root -p [redacted] --authenticationDatabase admin");
	});

	it("applies to sandbox inputs from any entry point", () => {
		const event = JSON.stringify(
			redactAuditValue({
				sandboxId: "sb_1",
				cmd: "curl --password=hunter2 https://example.com",
				envVars: "DATABASE_PASSWORD=hunter2",
			}),
		);
		expect(event).not.toContain("hunter2");
		expect(event).toContain("sb_1");
		expect(
			redactAuditValue({
				command: 'echo "-----BEGIN OPENSSH PRIVATE KEY-----" > ~/.ssh/id',
			}),
		).toEqual({ command: "[redacted]" });
		expect(redactAuditValue({ command: "x".repeat(3000) })).toEqual({
			command: "[3000 chars]",
		});
	});
});

describe("requestNetworkFields", () => {
	it("prefers the Cloudflare client IP over X-Forwarded-For", () => {
		expect(
			requestNetworkFields(
				{
					"cf-connecting-ip": "203.0.113.7",
					"x-forwarded-for": "10.0.0.2, 10.0.0.3",
					"user-agent": "curl/8",
				},
				"10.0.0.9",
			),
		).toEqual({
			ip: "203.0.113.7",
			forwardedFor: "10.0.0.2, 10.0.0.3",
			userAgent: "curl/8",
		});
	});

	it("falls back to the first forwarded hop, then the socket", () => {
		expect(
			requestNetworkFields(
				new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }),
			).ip,
		).toBe("198.51.100.1");
		expect(requestNetworkFields({}, "10.0.0.9").ip).toBe("10.0.0.9");
	});
});

describe("requestAuditFields", () => {
	it("marks API key requests and keeps the impersonator", () => {
		expect(
			requestAuditFields(
				{ headers: {} },
				{ activeOrganizationId: "org1", apiKeyId: "key1" },
				{ id: "u1", email: "a@b.c", role: "admin" },
			),
		).toMatchObject({
			authMethod: "apiKey",
			apiKeyId: "key1",
			organizationId: "org1",
		});
		expect(
			requestAuditFields(
				{ headers: {} },
				{ id: "s1", activeOrganizationId: "org1", impersonatedBy: "u9" },
				{ id: "u1" },
			),
		).toMatchObject({
			authMethod: "session",
			sessionId: "s1",
			impersonatedBy: "u9",
		});
		expect(requestAuditFields(undefined, null, null).authMethod).toBe(
			"anonymous",
		);
	});
});

describe("emitAuditEvent", () => {
	afterEach(() => {
		constants.IS_CLOUD = true;
		vi.restoreAllMocks();
	});

	it("writes one JSON line tagged for Vector on Cloud", () => {
		const write = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
		emitAuditEvent({ source: "trpc", path: "project.create" });
		const line = write.mock.calls[0]?.[0] as string;
		expect(line.endsWith("\n")).toBe(true);
		expect(JSON.parse(line)).toMatchObject({
			log_type: "dokploy.audit",
			source: "trpc",
			path: "project.create",
		});
	});

	it("does nothing on self-hosted", () => {
		constants.IS_CLOUD = false;
		const write = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
		emitAuditEvent({ source: "trpc" });
		expect(write).not.toHaveBeenCalled();
	});
});

describe("shouldAuditProcedure", () => {
	it("audits mutations, subscriptions, sensitive queries and auth failures", () => {
		expect(shouldAuditProcedure("project.create", "mutation")).toBe(true);
		expect(shouldAuditProcedure("server.setupWithLogs", "subscription")).toBe(
			true,
		);
		expect(shouldAuditProcedure("ai.getAll", "query")).toBe(true);
		expect(shouldAuditProcedure("project.all", "query")).toBe(false);
		expect(shouldAuditProcedure("project.all", "query", "FORBIDDEN")).toBe(
			true,
		);
		expect(shouldAuditProcedure("project.all", "query", "NOT_FOUND")).toBe(
			false,
		);
	});

	it("only lists queries that exist in the router", async () => {
		const { appRouter } = await import("@/server/api/root");
		const procedures = appRouter._def.procedures as unknown as Record<
			string,
			{ _def: { type: string } }
		>;
		const missing = [...SENSITIVE_QUERY_PATHS].filter(
			(path) => procedures[path]?._def.type !== "query",
		);
		expect(missing).toEqual([]);
	});
});
