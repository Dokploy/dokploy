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
	requestAuditFields,
	requestNetworkFields,
} from "@dokploy/server/lib/audit-stream";
import {
	SENSITIVE_QUERY_PATHS,
	shouldAuditProcedure,
} from "@/server/api/utils/audit";

describe("redactAuditValue", () => {
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
			endpoint: "https://hooks.example.com/notify?[redacted]",
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
