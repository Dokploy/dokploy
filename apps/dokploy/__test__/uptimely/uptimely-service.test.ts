import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Service-level behaviour of the Uptimely integration: which monitors a
 * service gets, and how monitor statuses roll up. Uptimely is faked at the
 * `fetch` boundary so the real MCP client runs.
 */

const mocks = vi.hoisted(() => ({
	linksFindMany: vi.fn(),
	insertedLinks: [] as Record<string, unknown>[],
	findApplicationById: vi.fn(),
	findDomainsByApplicationId: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => {
	const tableMock = () => ({
		findFirst: vi.fn(async () => undefined),
		findMany: vi.fn(async () => []),
	});
	return {
		db: {
			query: new Proxy({} as Record<string, unknown>, {
				get: (_target, table) =>
					table === "uptimelyMonitorLink"
						? { findMany: mocks.linksFindMany, findFirst: vi.fn() }
						: tableMock(),
			}),
			insert: vi.fn(() => ({
				values: (row: Record<string, unknown>) => ({
					returning: async () => {
						const stored = {
							linkId: `link-${mocks.insertedLinks.length + 1}`,
							...row,
						};
						mocks.insertedLinks.push(stored);
						return [stored];
					},
				}),
			})),
			execute: vi.fn(async () => []),
		},
		dbUrl: "postgres://mock:mock@localhost:5432/mock",
	};
});

vi.mock("@dokploy/server/services/application", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/application")
	>()),
	findApplicationById: mocks.findApplicationById,
}));

vi.mock("@dokploy/server/services/domain", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/services/domain")>()),
	findDomainsByApplicationId: mocks.findDomainsByApplicationId,
}));

const {
	buildUptimelyDailyTimeline,
	getUptimelyServiceStatus,
	linkUptimelyService,
	planUptimelyMonitors,
	worstUptimelyStatus,
} = await import("@dokploy/server/services/uptimely");

const PROJECT = "11111111-1111-4111-8111-111111111111";

const integration = {
	uptimelyId: "upt-1",
	organizationId: "org-1",
	name: "Uptimely",
	apiKey: "key",
	projectId: PROJECT,
	baseUrl: "https://uptimely.test",
	statusPageSlug: null,
	createdAt: new Date(),
};

type ToolCall = { name: string; arguments: Record<string, unknown> };
let toolCalls: ToolCall[] = [];
let toolHandler: (call: ToolCall) => unknown = () => ({});

/** Reads back `const input = JSON.parse("<json>");\nreturn await external_x(input);`. */
const decodeProgram = (code: string): ToolCall => {
	const match =
		/^const input = JSON\.parse\(("(?:[^"\\]|\\.)*")\);\nreturn await external_([A-Za-z0-9_]+)\(input\);$/.exec(
			code,
		);
	if (!match) throw new Error(`Unexpected generated program: ${code}`);
	return {
		name: match[2] as string,
		arguments: JSON.parse(JSON.parse(match[1] as string)),
	};
};

const installFetch = () => {
	toolCalls = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init?: RequestInit) => {
			const req = JSON.parse(String(init?.body));
			if (req.method === "initialize") {
				return Response.json({
					jsonrpc: "2.0",
					id: req.id,
					result: { protocolVersion: "2025-03-26", capabilities: {} },
				});
			}
			// Code Mode: the only tool is `execute_typescript`; decode the
			// generated program back into the Uptimely tool call it makes.
			expect(req.params.name).toBe("execute_typescript");
			const call = decodeProgram(String(req.params.arguments.code));
			toolCalls.push(call);
			let envelope: unknown;
			try {
				envelope = { success: true, result: toolHandler(call), logs: [] };
			} catch (error) {
				envelope = {
					success: false,
					logs: [],
					error: {
						name: "Error",
						message: `TOOL_EXECUTION_FAILED: ${(error as Error).message}`,
					},
				};
			}
			return Response.json({
				jsonrpc: "2.0",
				id: req.id,
				result: { content: [{ type: "text", text: JSON.stringify(envelope) }] },
			});
		}),
	);
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.insertedLinks = [];
	mocks.linksFindMany.mockResolvedValue([]);
	installFetch();
});

describe("linkUptimelyService", () => {
	beforeEach(() => {
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			name: "web",
			environment: { project: { name: "Devino", organizationId: "org-1" } },
		});
		mocks.findDomainsByApplicationId.mockResolvedValue([
			{ host: "app.example.com", https: true, path: "/" },
			{ host: "www.example.com", https: true, path: "/" },
			// Not monitored: plain HTTP, wildcard, and a preview domain.
			{ host: "plain.example.com", https: false, path: "/" },
			{ host: "*.example.com", https: true, path: "/" },
			{
				host: "pr-1.example.com",
				https: true,
				path: "/",
				domainType: "preview",
			},
		]);
		let n = 0;
		toolHandler = (call) => {
			n++;
			return {
				monitorId: `mon-${n}`,
				slug: `m-${n}`,
				name: call.arguments.name,
				monitorType: call.arguments.monitorType,
				created: true,
			};
		};
	});

	it("creates one Website monitor per HTTPS domain", async () => {
		const result = await linkUptimelyService({
			integration,
			serviceType: "application",
			serviceId: "app-1",
			includeSslAndDomain: false,
		});

		expect(toolCalls.map((c) => c.name)).toEqual([
			"uptimely_monitor_create",
			"uptimely_monitor_create",
		]);
		expect(toolCalls.map((c) => c.arguments)).toEqual([
			expect.objectContaining({
				projectId: PROJECT,
				monitorType: "Website",
				url: "https://app.example.com",
				monitoringInterval: "*/5 * * * *",
				name: "Devino/web (app.example.com)",
			}),
			expect.objectContaining({
				projectId: PROJECT,
				monitorType: "Website",
				url: "https://www.example.com",
				monitoringInterval: "*/5 * * * *",
				name: "Devino/web (www.example.com)",
			}),
		]);
		expect(result.created).toHaveLength(2);
		expect(mocks.insertedLinks).toEqual([
			expect.objectContaining({
				uptimelyId: "upt-1",
				serviceType: "application",
				serviceId: "app-1",
				monitorId: "mon-1",
				kind: "website",
				target: "https://app.example.com",
			}),
			expect.objectContaining({
				monitorId: "mon-2",
				kind: "website",
				target: "https://www.example.com",
			}),
		]);
	});

	it("adds SSL certificate and Domain monitors per host when asked", async () => {
		await linkUptimelyService({
			integration,
			serviceType: "application",
			serviceId: "app-1",
			includeSslAndDomain: true,
		});

		expect(
			toolCalls.map((c) => [
				c.arguments.monitorType,
				c.arguments.url ?? c.arguments.host,
			]),
		).toEqual([
			["Website", "https://app.example.com"],
			["Website", "https://www.example.com"],
			["SSL Certificate", "app.example.com"],
			["SSL Certificate", "www.example.com"],
			["Domain", "app.example.com"],
			["Domain", "www.example.com"],
		]);
		expect(mocks.insertedLinks.map((l) => l.kind)).toEqual([
			"website",
			"website",
			"ssl",
			"ssl",
			"domain",
			"domain",
		]);
	});

	it("skips monitors that are already linked", async () => {
		mocks.linksFindMany.mockResolvedValue([
			{
				linkId: "existing",
				kind: "website",
				target: "https://app.example.com",
				monitorId: "mon-old",
			},
		]);
		const result = await linkUptimelyService({
			integration,
			serviceType: "application",
			serviceId: "app-1",
			includeSslAndDomain: false,
		});
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0]?.arguments.url).toBe("https://www.example.com");
		expect(result.skipped).toBe(1);
	});

	it("refuses when the service has nothing to monitor", async () => {
		mocks.findDomainsByApplicationId.mockResolvedValue([]);
		await expect(
			linkUptimelyService({
				integration,
				serviceType: "application",
				serviceId: "app-1",
				includeSslAndDomain: true,
			}),
		).rejects.toThrow(/add a domain with HTTPS/);
		expect(toolCalls).toHaveLength(0);
	});

	it("keeps the monitors created before Uptimely refused one", async () => {
		let n = 0;
		toolHandler = () => {
			n++;
			if (n === 2) throw new Error("Plan limit reached");
			return { monitorId: `mon-${n}` };
		};
		await expect(
			linkUptimelyService({
				integration,
				serviceType: "application",
				serviceId: "app-1",
				includeSslAndDomain: false,
			}),
		).rejects.toThrow(/Created 1 of 2 monitors.*Plan limit reached/);
		expect(mocks.insertedLinks.map((l) => l.monitorId)).toEqual(["mon-1"]);
	});
});

describe("planUptimelyMonitors", () => {
	it("plans a Port monitor for a database with an external port", () => {
		const plan = planUptimelyMonitors(
			{
				organizationId: "org-1",
				projectName: "Devino",
				serviceName: "db",
				httpsUrls: [],
				externalEndpoint: { host: "203.0.113.5", port: 5432 },
			},
			{ includeSslAndDomain: true },
		);
		expect(plan).toEqual([
			expect.objectContaining({
				kind: "port",
				monitorType: "Port",
				target: "203.0.113.5:5432",
				args: expect.objectContaining({ host: "203.0.113.5", port: 5432 }),
			}),
		]);
	});
});

describe("getUptimelyServiceStatus", () => {
	const operational = { id: "s1", name: "Operational", color: "#16a34a" };
	const degraded = { id: "s2", name: "Degraded", color: "#f59e0b" };
	const offline = { id: "s3", name: "Offline", color: "#dc2626" };

	const detail = (id: string, status: typeof operational) => ({
		id,
		name: id,
		monitorType: "Website",
		currentStatus: status,
		statusTimeline: [
			{
				id: `t-${id}`,
				status,
				startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
				endsAt: null,
				rootCause: null,
				createdAt: new Date().toISOString(),
			},
		],
	});

	it("aggregates the worst status across the linked monitors", async () => {
		mocks.linksFindMany.mockResolvedValue([
			{ linkId: "l1", monitorId: "m1", kind: "website", target: "a" },
			{ linkId: "l2", monitorId: "m2", kind: "ssl", target: "b" },
			{ linkId: "l3", monitorId: "m3", kind: "domain", target: "c" },
		]);
		const byId: Record<string, typeof operational> = {
			m1: operational,
			m2: offline,
			m3: degraded,
		};
		toolHandler = (call) => {
			const id = call.arguments.monitorId as string;
			return detail(id, byId[id] as typeof operational);
		};

		const status = await getUptimelyServiceStatus({
			integration,
			serviceType: "application",
			serviceId: "app-1",
		});

		expect(status.overall).toEqual(offline);
		expect(status.monitors.map((m) => m.status?.name)).toEqual([
			"Operational",
			"Offline",
			"Degraded",
		]);
		expect(status.monitors[0]?.url).toBe(
			`https://uptimely.test/dashboard/${PROJECT}/monitors/m1`,
		);
		expect(status.monitors[0]?.timeline).toHaveLength(30);
		expect(toolCalls.every((c) => c.name === "uptimely_monitor_get")).toBe(
			true,
		);
	});

	it("reports an unreadable monitor without hiding the others", async () => {
		mocks.linksFindMany.mockResolvedValue([
			{ linkId: "l1", monitorId: "m1", kind: "website", target: "a" },
			{ linkId: "l2", monitorId: "gone", kind: "website", target: "b" },
		]);
		toolHandler = (call) => {
			if (call.arguments.monitorId === "gone") {
				return { error: "Monitor not found or access denied." };
			}
			return detail("m1", operational);
		};
		const status = await getUptimelyServiceStatus({
			integration,
			serviceType: "application",
			serviceId: "app-1",
		});
		expect(status.monitors[1]?.error).toBe(
			"Monitor not found or access denied.",
		);
		// Unknown ranks worse than Operational, so the service is not "green".
		expect(status.overall).toBeNull();
	});
});

describe("status helpers", () => {
	it("worstUptimelyStatus ranks Offline > Degraded > Operational", () => {
		expect(
			worstUptimelyStatus([
				{ name: "Operational", color: "g" },
				{ name: "Degraded Performance", color: "y" },
			])?.name,
		).toBe("Degraded Performance");
		expect(worstUptimelyStatus([])).toBeNull();
	});

	it("buildUptimelyDailyTimeline buckets segments per UTC day", () => {
		const now = new Date("2026-09-22T12:00:00Z");
		const days = buildUptimelyDailyTimeline(
			[
				{
					status: { name: "Operational", color: "g" },
					startsAt: "2026-09-20T00:00:00Z",
					endsAt: null,
					createdAt: "2026-09-20T00:00:00Z",
				},
				{
					status: { name: "Offline", color: "r" },
					startsAt: "2026-09-21T10:00:00Z",
					endsAt: "2026-09-21T10:30:00Z",
					createdAt: "2026-09-21T10:00:00Z",
				},
			],
			30,
			now,
		);
		expect(days).toHaveLength(30);
		expect(days.at(-1)?.day).toBe("2026-09-22");
		expect(days.at(-1)?.status?.name).toBe("Operational");
		expect(days.at(-2)?.status?.name).toBe("Offline");
		expect(days.at(-3)?.status?.name).toBe("Operational");
		expect(days.at(-4)?.status).toBeNull();
	});
});
