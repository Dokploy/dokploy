import path from "node:path";
import { fs, vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const state = {
		hosts: [] as { host: string }[],
		restartUpdates: [] as (Date | null)[],
		pendingServers: [] as { serverId: string }[],
	};
	const domainQuery = () => {
		const chain = {
			innerJoin: () => chain,
			where: async () => state.hosts,
		};
		return chain;
	};
	return {
		state,
		domainQuery,
		execAsync: vi.fn(),
		execAsyncRemote: vi.fn(),
		restoreInterruptedTraefikOnServers: vi.fn(),
		whileTraefikStopped: vi.fn(
			async (
				_serverId: string | undefined,
				task: () => Promise<unknown>,
				beforeStop?: () => Promise<unknown>,
			) => {
				if ((await beforeStop?.()) === false) return;
				await task();
			},
		),
	};
});

vi.mock("node:fs", () => ({ ...fs, default: fs }));

vi.mock("@dokploy/server/db", () => ({
	db: {
		select: () => ({ from: () => mocks.domainQuery() }),
		update: () => ({
			set: (values: { traefikRestartStartedAt: Date | null }) => ({
				where: async () => {
					mocks.state.restartUpdates.push(values.traefikRestartStartedAt);
				},
			}),
		}),
		query: {
			server: { findMany: async () => mocks.state.pendingServers },
		},
	},
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: async () => ({ host: "panel.example.com" }),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@dokploy/server/setup/traefik-setup", () => ({
	whileTraefikStopped: mocks.whileTraefikStopped,
	restoreInterruptedTraefikOnServers: mocks.restoreInterruptedTraefikOnServers,
}));

import {
	acmeBackupDirectory,
	addConfigTextNames,
	addTraefikLabelNames,
	addTraefikRouteNames,
	findRemovableTraefikCertificates,
	findUnusedAcmeCertificates,
	getUnusedTraefikCertificates,
	listAcmeCertificates,
	parseAcmeStorage,
	recoverInterruptedTraefikRestarts,
	removeTraefikCertificates,
	withoutAcmeCertificates,
} from "@dokploy/server/services/traefik-certificates";

const OLD_EXAMPLE_CERT =
	"LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUNHRENDQWI0Q0NRRDExeDJ4L2NuRWtUQUtCZ2dxaGtqT1BRUURBakFhTVJnd0ZnWURWUVFEREE5dmJHUXUKWlhoaGJYQnNaUzVqYjIwd0hoY05Nall4TVRBMU1UVTBNekk0V2hjTk1qWXhNVEEyTVRVME16STRXakFhTVJndwpGZ1lEVlFRRERBOXZiR1F1WlhoaGJYQnNaUzVqYjIwd2dnRkxNSUlCQXdZSEtvWkl6ajBDQVRDQjl3SUJBVEFzCkJnY3Foa2pPUFFFQkFpRUEvLy8vL3dBQUFBRUFBQUFBQUFBQUFBQUFBQUQvLy8vLy8vLy8vLy8vLy84d1d3UWcKLy8vLy93QUFBQUVBQUFBQUFBQUFBQUFBQUFELy8vLy8vLy8vLy8vLy8vd0VJRnJHTmRpcU9wUG5zK3U5VlhhWQpocnhsSFFhd3pGT3c5anZPUEQ0bjBtQkxBeFVBeEowMkNJYm5CSk5xWm5qaEU1MG10NEdmZnBBRVFRUnJGOUh5CjRTeENSL2k4NXVWanBFRHlkd045Z1Mzck02RDBvVGxGMkpqQ2xrL2pRdUwrR24rYmp1ZnJTbndQbmhZcnpqTlgKYXpGZXpzdTJRR2czdjFIMUFpRUEvLy8vL3dBQUFBRC8vLy8vLy8vLy83em0rcTJuRjU2RTg3bkt3dnhqSlZFQwpBUUVEUWdBRWJSNHQ0RXdRbmtMYjdoQjh3SkV5ZzNXZTZ2aHhYcHJ5T3p4aDFNcmVSRkZrM3pvRmZEczZBa1g5Cmo0Z3VHUThjU1NLQTZheGhoQmo5NmJ3d3c2M25yVEFLQmdncWhrak9QUVFEQWdOSUFEQkZBaUVBNE5vdUNnanMKYS9VN011RloxSzJaall2SEU1WlN3UGtVRTlOZ3h2YW1ja0lDSUFXZjRURWxjMnpncGh3ZGZxWWZ4dE95SGlleQpOUFA5dmhpRDM3Q1VUTy85Ci0tLS0tRU5EIENFUlRJRklDQVRFLS0tLS0K";
const WILDCARD_CERT =
	"LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUNIakNDQWNRQ0NRQ09mdGY3R29qRjZ6QUtCZ2dxaGtqT1BRUURBakFkTVJzd0dRWURWUVFEREJJcUxuZHAKYkdRdVpYaGhiWEJzWlM1amIyMHdIaGNOTWpZeE1UQTFNVFUwTXpJNFdoY05Nell4TVRBeU1UVTBNekk0V2pBZApNUnN3R1FZRFZRUUREQklxTG5kcGJHUXVaWGhoYlhCc1pTNWpiMjB3Z2dGTE1JSUJBd1lIS29aSXpqMENBVENCCjl3SUJBVEFzQmdjcWhrak9QUUVCQWlFQS8vLy8vd0FBQUFFQUFBQUFBQUFBQUFBQUFBRC8vLy8vLy8vLy8vLy8KLy84d1d3UWcvLy8vL3dBQUFBRUFBQUFBQUFBQUFBQUFBQUQvLy8vLy8vLy8vLy8vLy93RUlGckdOZGlxT3BQbgpzK3U5VlhhWWhyeGxIUWF3ekZPdzlqdk9QRDRuMG1CTEF4VUF4SjAyQ0libkJKTnFabmpoRTUwbXQ0R2ZmcEFFClFRUnJGOUh5NFN4Q1IvaTg1dVZqcEVEeWR3TjlnUzNyTTZEMG9UbEYySmpDbGsvalF1TCtHbitianVmclNud1AKbmhZcnpqTlhhekZlenN1MlFHZzN2MUgxQWlFQS8vLy8vd0FBQUFELy8vLy8vLy8vLzd6bStxMm5GNTZFODduSwp3dnhqSlZFQ0FRRURRZ0FFM2VFUHBFWWMrTktyWnZuWFdxaENUR0lldDlHVTlKWWJyOEE5NGYzSU83Ym5IbUNUCkM1cmZDUjNIWWVSWUVLQnlMdHdCVGNwa0orNlRtczBmQ1RoUTJUQUtCZ2dxaGtqT1BRUURBZ05JQURCRkFpRUEKL0gybC90SWRhTklxemJTRHE3dHVndTlFUlRxQ1lKTXFrUHFRUTJqRDZLY0NJQ2g4R2gzbDVmcUo2amVjMU5JUgpLMnFLN0RFTVJiOWVuQ0REcDJJSCtkZysKLS0tLS1FTkQgQ0VSVElGSUNBVEUtLS0tLQo=";

const storage = () => ({
	letsencrypt: {
		Account: { Email: "admin@example.com" },
		Certificates: [
			{
				domain: { main: "old.example.com" },
				certificate: OLD_EXAMPLE_CERT,
				key: "a2V5",
				Store: "default",
			},
			{
				domain: { main: "app.example.com", sans: ["www.app.example.com"] },
				certificate: OLD_EXAMPLE_CERT,
				key: "a2V5",
				Store: "default",
			},
			{
				domain: { main: "*.wild.example.com" },
				certificate: WILDCARD_CERT,
				key: "a2V5",
				Store: "default",
			},
			{
				domain: { main: "panel.example.com" },
				certificate: OLD_EXAMPLE_CERT,
				key: "a2V5",
				Store: "default",
			},
		],
	},
	cloudflare: {
		Account: null,
		Certificates: [
			{
				domain: { main: "dns.example.com" },
				certificate: "bm90LWEtY2VydA==",
				key: "a2V5",
				Store: "default",
			},
		],
	},
});

const routes = {
	routers: { api: { rule: "Host(`api.wild.example.com`)" } },
};

const LOCAL_ACME = path.join(
	process.cwd(),
	".docker",
	"traefik",
	"dynamic",
	"acme.json",
);

const idOf = (main: string, resolver = "letsencrypt") => {
	const found = listAcmeCertificates(storage()).find(
		(certificate) =>
			certificate.main === main && certificate.resolver === resolver,
	);
	return found?.id ?? `missing-${main}`;
};

const used = () => ({
	hosts: new Set<string>(),
	patterns: [] as RegExp[],
	incomplete: false,
});

describe("addTraefikRouteNames", () => {
	it("collects hosts, SNI names, TLS domains and host patterns from Traefik's routers", () => {
		const names = addTraefikRouteNames(used(), {
			routers: {
				web: {
					rule: 'Host(`A.example.com`) || (Host("b.example.com") && PathPrefix(`/x`))',
					tls: {
						domains: [{ main: "main.example.com", sans: ["san.example.com"] }],
					},
				},
				regex: { rule: "HostRegexp(`^(foo|bar)\\.re\\.example\\.com$`)" },
				broken: { rule: "HostRegexp(`(`)" },
			},
			tcpRouters: {
				db: { rule: "HostSNI(`tcp.example.com`)" },
				any: { rule: "HostSNI(`*`)" },
			},
		});

		expect([...names.hosts].sort()).toEqual([
			"a.example.com",
			"b.example.com",
			"main.example.com",
			"san.example.com",
			"tcp.example.com",
		]);
		expect(names.patterns).toHaveLength(1);
		expect(names.incomplete).toBe(true);
		expect(names.patterns[0]?.test("foo.re.example.com")).toBe(true);
	});
});

describe("parseAcmeStorage", () => {
	it("treats an empty file as no certificates", () => {
		expect(parseAcmeStorage("  \n")).toEqual({});
	});

	it("explains a broken or unexpected acme.json", () => {
		expect(() => parseAcmeStorage("{ not json")).toThrow(
			"acme.json is not valid JSON.",
		);
		expect(() => parseAcmeStorage("[]")).toThrow(
			"acme.json has an unexpected format.",
		);
		expect(() => parseAcmeStorage("null")).toThrow(
			"acme.json has an unexpected format.",
		);
	});
});

describe("listAcmeCertificates", () => {
	it("skips malformed entries and lists each certificate once", () => {
		const certificates = listAcmeCertificates({
			letsencrypt: {
				Certificates: [
					null,
					"oops",
					{ domain: null },
					{ domain: { main: 42 } },
					{ domain: { main: "a.example.com", sans: ["b.example.com", 7] } },
					{ domain: { main: "A.example.com.", sans: ["B.example.com"] } },
				],
			},
			broken: { Certificates: "nope" },
			empty: null,
		});

		expect(certificates).toEqual([
			{
				id: expect.stringMatching(/^[0-9a-f]{32}$/),
				resolver: "letsencrypt",
				main: "a.example.com",
				sans: ["b.example.com"],
				expiresAt: null,
			},
		]);
	});
});

describe("findUnusedAcmeCertificates", () => {
	it("matches Unicode, port and trailing-dot spellings of the same name", () => {
		const names = used();
		addTraefikRouteNames(names, {
			routers: {
				idn: { rule: "Host(`münchen.example`)" },
				dot: { rule: "Host(`dot.example.com.`)" },
			},
		});
		names.hosts.add("port.example.com");

		const unused = findUnusedAcmeCertificates(
			{
				letsencrypt: {
					Certificates: [
						{ domain: { main: "xn--mnchen-3ya.example" } },
						{ domain: { main: "DOT.example.com" } },
						{ domain: { main: "port.example.com:443" } },
					],
				},
			},
			names,
		);

		expect(unused).toEqual([]);
	});

	it("understands Traefik v2 HostRegexp templates and Go named groups", () => {
		const names = addTraefikRouteNames(used(), {
			routers: {
				v2: { rule: "HostRegexp(`{sub:[a-z]+}.v2.example.com`)" },
				named: { rule: "HostRegexp(`^(?P<app>[a-z]+)\\.go\\.example\\.com$`)" },
			},
		});

		const unused = findUnusedAcmeCertificates(
			{
				letsencrypt: {
					Certificates: [
						{ domain: { main: "shop.v2.example.com" } },
						{ domain: { main: "api.go.example.com" } },
						{ domain: { main: "shop.v2.example.com.evil.io" } },
					],
				},
			},
			names,
		);

		expect(unused.map((c) => c.main)).toEqual(["shop.v2.example.com.evil.io"]);
	});

	it("treats a wildcard certificate as used only by hosts one level below it", () => {
		const wildcard = {
			letsencrypt: {
				Certificates: [
					{
						domain: { main: "*.wild.example.com" },
						certificate: WILDCARD_CERT,
					},
				],
			},
		};
		const deep = used();
		deep.hosts.add("a.b.wild.example.com");
		const direct = used();
		direct.hosts.add("a.wild.example.com");

		expect(findUnusedAcmeCertificates(wildcard, deep)).toHaveLength(1);
		expect(findUnusedAcmeCertificates(wildcard, direct)).toHaveLength(0);
	});

	it("keeps a certificate whose name matches a HostRegexp route", () => {
		const names = addTraefikRouteNames(used(), {
			routers: { r: { rule: "HostRegexp(`^.+\\.wild\\.example\\.com$`)" } },
		});

		expect(
			findUnusedAcmeCertificates(storage(), names).map((c) => c.main),
		).not.toContain("*.wild.example.com");
	});
});

describe("route patterns", () => {
	const certificate = (main: string) => ({ domain: { main } });

	it("keeps a wildcard certificate that a pattern route could use", () => {
		const names = addTraefikRouteNames(used(), {
			routers: {
				shop: { rule: "HostRegexp(`^shop[0-9]+\\.wild\\.example\\.com$`)" },
			},
		});

		const unused = findUnusedAcmeCertificates(
			{
				letsencrypt: {
					Certificates: [
						certificate("*.wild.example.com"),
						certificate("*.other.example.com"),
					],
				},
			},
			names,
		);

		expect(unused.map((c) => c.main)).toEqual(["*.other.example.com"]);
	});

	it("reads Go inline flags, anchors, quoting and POSIX classes", () => {
		const names = addTraefikRouteNames(used(), {
			routers: {
				flag: { rule: "HostRegexp(`(?i)^SHOP\\.example\\.com$`)" },
				group: { rule: "HostRegexp(`^(?i:api)\\.example\\.com$`)" },
				anchors: { rule: "HostRegexp(`\\Aexact\\.example\\.com\\z`)" },
				quoted: { rule: "HostRegexp(`^\\Qliteral.example.com\\E$`)" },
				posix: { rule: "HostRegexp(`^[[:alpha:]]+\\.posix\\.example\\.com$`)" },
				legacy: { rule: "HostHeader(`legacy.example.com`)" },
			},
		});

		const unused = findUnusedAcmeCertificates(
			{
				letsencrypt: {
					Certificates: [
						certificate("shop.example.com"),
						certificate("api.example.com"),
						certificate("exact.example.com"),
						certificate("literal.example.com"),
						certificate("abc.posix.example.com"),
						certificate("legacy.example.com"),
						certificate("literalxexample.com"),
						certificate("other.example.com"),
					],
				},
			},
			names,
		);

		expect(names.incomplete).toBe(false);
		expect(unused.map((c) => c.main)).toEqual([
			"literalxexample.com",
			"other.example.com",
		]);
	});

	it("marks the routes as incomplete when a pattern can't be read", () => {
		const names = addTraefikRouteNames(used(), {
			routers: {
				broken: { rule: "HostRegexp(`(`)" },
				unquoted: { rule: "HostRegexp(app)" },
			},
		});

		expect(names.incomplete).toBe(true);
	});
});

describe("certificates sharing a main domain", () => {
	const entries = () => ({
		letsencrypt: {
			Certificates: [
				{ domain: { main: "example.com" }, certificate: "" },
				{
					domain: { main: "example.com", sans: ["www.example.com"] },
					certificate: "",
				},
			],
		},
	});

	it("lists and removes each certificate by its full set of names", () => {
		const names = used();
		names.hosts.add("www.example.com");
		const data = entries();

		const unused = findUnusedAcmeCertificates(data, names);
		const removed = withoutAcmeCertificates(
			data,
			unused.map(({ id }) => id),
		);

		expect(unused.map((c) => [c.main, c.sans])).toEqual([["example.com", []]]);
		expect(removed).toBe(1);
		expect(data.letsencrypt.Certificates).toEqual([
			{
				domain: { main: "example.com", sans: ["www.example.com"] },
				certificate: "",
			},
		]);
	});

	it("gives the same id to the same names in any order or case", () => {
		const ids = listAcmeCertificates({
			a: {
				Certificates: [
					{
						domain: {
							main: "Example.com",
							sans: ["b.example.com", "a.example.com"],
						},
					},
				],
			},
			b: {
				Certificates: [
					{
						domain: {
							main: "example.com.",
							sans: ["A.example.com", "b.example.com"],
						},
					},
				],
			},
		}).map(({ id }) => id);

		expect(ids[0]).not.toBe(ids[1]);
		expect(
			listAcmeCertificates({
				a: {
					Certificates: [
						{
							domain: {
								main: "example.com.",
								sans: ["A.example.com", "b.example.com"],
							},
						},
					],
				},
			})[0]?.id,
		).toBe(ids[0]);
	});
});

describe("other places a domain can be in use", () => {
	it("reads router rules and TLS domains from container and service labels", () => {
		const names = addTraefikLabelNames(
			used(),
			[
				JSON.stringify({
					"traefik.enable": "true",
					"traefik.http.routers.shop.rule": "Host(`shop.example.com`)",
					"traefik.http.routers.shop.tls.domains[0].main": "main.example.com",
					"traefik.http.routers.shop.tls.domains[0].sans":
						"a.example.com,b.example.com",
				}),
				"null",
				"",
				JSON.stringify({
					"traefik.tcp.routers.db.rule": "HostSNI(`db.example.com`)",
				}),
			].join("\n"),
		);

		expect([...names.hosts].sort()).toEqual([
			"a.example.com",
			"b.example.com",
			"db.example.com",
			"main.example.com",
			"shop.example.com",
		]);
		expect(names.incomplete).toBe(false);
	});

	it("marks the names incomplete when a label line can't be read", () => {
		expect(addTraefikLabelNames(used(), "{ broken").incomplete).toBe(true);
	});

	it("finds host names in hand-written Traefik files, even broken ones", () => {
		const names = addConfigTextNames(
			used(),
			"http:\n  routers:\n    old:\n      rule: Host(`Manual.Example.com`)\n   bad-indent: [",
		);

		expect(names.hosts.has("manual.example.com")).toBe(true);
	});
});

describe("withoutAcmeCertificates", () => {
	it("removes only the given certificates and keeps the account and other resolvers", () => {
		const data = storage();

		const removed = withoutAcmeCertificates(data, [
			idOf("old.example.com"),
			idOf("old.example.com", "cloudflare"),
		]);

		expect(removed).toBe(1);
		expect(data.letsencrypt.Account).toEqual({ Email: "admin@example.com" });
		expect(data.letsencrypt.Certificates.map((c) => c.domain.main)).toEqual([
			"app.example.com",
			"*.wild.example.com",
			"panel.example.com",
		]);
		expect(data.cloudflare.Certificates).toHaveLength(1);
	});
});

describe("unused Traefik certificates", () => {
	beforeEach(() => {
		vol.reset();
		vi.clearAllMocks();
		mocks.state.restartUpdates = [];
		mocks.state.hosts = [{ host: "App.Example.com" }];
	});

	it("lists certificates no domain, route or panel uses, soonest expiry first", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });
		mocks.execAsync.mockResolvedValue({
			stdout: JSON.stringify(routes),
			stderr: "",
		});

		const result = await getUnusedTraefikCertificates();

		expect(result).toEqual({
			routesComplete: true,
			certificates: [
				{
					id: idOf("old.example.com"),
					resolver: "letsencrypt",
					main: "old.example.com",
					sans: [],
					expiresAt: "2026-11-06T15:43:28.000Z",
				},
				{
					id: idOf("dns.example.com", "cloudflare"),
					resolver: "cloudflare",
					main: "dns.example.com",
					sans: [],
					expiresAt: null,
				},
			],
		});
		expect(mocks.execAsync.mock.calls[0]?.[0]).toContain(
			"docker exec dokploy-traefik wget",
		);
	});

	it("says so when Traefik's routes can't be read, and lists by Dokploy's domains alone", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });
		mocks.execAsync.mockRejectedValue(new Error("No such container"));

		const result = await getUnusedTraefikCertificates();

		expect(result.routesComplete).toBe(false);
		expect(result.certificates.map((c) => c.main)).toEqual([
			"old.example.com",
			"*.wild.example.com",
			"dns.example.com",
		]);
	});

	it("lists nothing when there is no acme.json yet", async () => {
		mocks.execAsync.mockResolvedValue({ stdout: "{}", stderr: "" });

		expect((await getUnusedTraefikCertificates()).certificates).toEqual([]);
	});

	it("only removes selections that are still unused", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });
		mocks.execAsync.mockResolvedValue({
			stdout: JSON.stringify(routes),
			stderr: "",
		});

		const removable = await findRemovableTraefikCertificates(undefined, [
			idOf("old.example.com"),
			idOf("app.example.com"),
			"0123456789abcdef0123456789abcdef",
		]);

		expect(removable.routesComplete).toBe(true);
		expect(removable.targets.map((target) => target.main)).toEqual([
			"old.example.com",
		]);
	});

	it("rewrites the local acme.json while Traefik is stopped, readable only by its owner", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });

		const removed = await removeTraefikCertificates(
			undefined,
			[idOf("old.example.com")],
			{ requireRoutes: false },
		);

		expect(removed).toBe(1);
		expect(mocks.whileTraefikStopped).toHaveBeenCalledWith(
			undefined,
			expect.any(Function),
			expect.any(Function),
		);
		const saved = JSON.parse(fs.readFileSync(LOCAL_ACME, "utf8") as string);
		expect(
			saved.letsencrypt.Certificates.map(
				(c: { domain: { main: string } }) => c.domain.main,
			),
		).toEqual(["app.example.com", "*.wild.example.com", "panel.example.com"]);
		expect(fs.statSync(LOCAL_ACME).mode & 0o777).toBe(0o600);
	});

	it("reads and rewrites a remote server's acme.json over SSH", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => ({
				stdout: command.startsWith("if [ -f") ? JSON.stringify(storage()) : "",
				stderr: "",
			}),
		);

		await removeTraefikCertificates("server-1", [idOf("old.example.com")], {
			requireRoutes: false,
		});

		const write = mocks.execAsyncRemote.mock.calls.find(([, command]) =>
			String(command).startsWith(
				"umask 077 && cat > /etc/dokploy/traefik/dynamic",
			),
		);
		const backup = mocks.execAsyncRemote.mock.calls.find(([, command]) =>
			String(command).startsWith("umask 077 && mkdir -p"),
		);
		expect(backup?.[1]).toMatch(
			/^umask 077 && mkdir -p \/etc\/dokploy\/traefik\/acme-backups && cat > \/etc\/dokploy\/traefik\/acme-backups\/acme-[0-9TZ-]+\.json && /,
		);
		expect(backup?.[3]).toBe(JSON.stringify(storage()));
		expect(write?.[1]).toBe(
			"umask 077 && cat > /etc/dokploy/traefik/dynamic/acme.json.tmp && mv /etc/dokploy/traefik/dynamic/acme.json.tmp /etc/dokploy/traefik/dynamic/acme.json || { rm -f /etc/dokploy/traefik/dynamic/acme.json.tmp; exit 1; }",
		);
		const saved = JSON.parse(write?.[3] as string);
		expect(saved.letsencrypt.Account).toEqual({ Email: "admin@example.com" });
		expect(saved.letsencrypt.Certificates).toHaveLength(3);
	});

	it("keeps a certificate whose domain was added back while the removal waited", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });
		mocks.execAsync.mockResolvedValue({
			stdout: JSON.stringify(routes),
			stderr: "",
		});
		mocks.whileTraefikStopped.mockImplementationOnce(
			async (_serverId, task, beforeStop) => {
				mocks.state.hosts.push({ host: "old.example.com" });
				await beforeStop?.();
				await task();
			},
		);

		await removeTraefikCertificates(undefined, [idOf("old.example.com")], {
			requireRoutes: false,
		});

		const saved = JSON.parse(fs.readFileSync(LOCAL_ACME, "utf8") as string);
		expect(saved).toEqual(storage());
	});

	it("explains why a remote acme.json couldn't be read", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => {
				if (command.startsWith("if [ -f")) {
					throw Object.assign(
						new Error("Remote command failed with exit code 1"),
						{
							stderr: "cat: acme.json: Permission denied\n",
						},
					);
				}
				return { stdout: "{}", stderr: "" };
			},
		);

		await expect(getUnusedTraefikCertificates("server-1")).rejects.toThrow(
			"Couldn't read /etc/dokploy/traefik/dynamic/acme.json: cat: acme.json: Permission denied",
		);
	});

	it("explains why a remote acme.json couldn't be written", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => {
				if (
					command.startsWith("umask 077 && cat > /etc/dokploy/traefik/dynamic")
				) {
					throw Object.assign(
						new Error("Remote command failed with exit code 1"),
						{
							stderr: "No space left on device",
						},
					);
				}
				return {
					stdout: command.startsWith("if [ -f")
						? JSON.stringify(storage())
						: "",
					stderr: "",
				};
			},
		);

		await expect(
			removeTraefikCertificates("server-1", [idOf("old.example.com")], {
				requireRoutes: false,
			}),
		).rejects.toThrow(
			"Couldn't write /etc/dokploy/traefik/dynamic/acme.json: No space left on device",
		);
	});

	it("warns when a route pattern can't be read", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });
		mocks.execAsync.mockResolvedValue({
			stdout: JSON.stringify({
				routers: { broken: { rule: "HostRegexp(`(`)" } },
			}),
			stderr: "",
		});

		expect((await getUnusedTraefikCertificates()).routesComplete).toBe(false);
	});

	it("reads routes again right before Traefik stops, keeping one added meanwhile", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });
		mocks.execAsync.mockResolvedValue({
			stdout: JSON.stringify(routes),
			stderr: "",
		});
		mocks.whileTraefikStopped.mockImplementationOnce(
			async (_serverId, task, beforeStop) => {
				mocks.execAsync.mockResolvedValue({
					stdout: JSON.stringify({
						routers: { manual: { rule: "Host(`old.example.com`)" } },
					}),
					stderr: "",
				});
				await beforeStop?.();
				await task();
			},
		);

		const removed = await removeTraefikCertificates(
			undefined,
			[idOf("old.example.com")],
			{ requireRoutes: true },
		);

		expect(removed).toBe(0);
		expect(JSON.parse(fs.readFileSync(LOCAL_ACME, "utf8") as string)).toEqual(
			storage(),
		);
	});

	it("removes nothing when the routes were readable at selection but not right before stopping", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });
		mocks.execAsync.mockRejectedValue(new Error("No such container"));

		await expect(
			removeTraefikCertificates(undefined, [idOf("old.example.com")], {
				requireRoutes: true,
			}),
		).rejects.toThrow("Couldn't read Traefik's routes to double-check");
		expect(JSON.parse(fs.readFileSync(LOCAL_ACME, "utf8") as string)).toEqual(
			storage(),
		);
	});

	it("keeps certificates used by a stopped container's labels or a hand-written file", async () => {
		vol.fromJSON({
			[LOCAL_ACME]: JSON.stringify(storage()),
			[path.join(path.dirname(LOCAL_ACME), "manual.yml")]:
				"rule: Host(`dns.example.com`)",
		});
		mocks.execAsync.mockImplementation(async (command: string) => ({
			stdout: command.includes("docker ps -aq")
				? JSON.stringify({
						"traefik.http.routers.app.rule": "Host(`old.example.com`)",
					})
				: JSON.stringify(routes),
			stderr: "",
		}));

		const result = await getUnusedTraefikCertificates();

		expect(result.routesComplete).toBe(true);
		expect(result.certificates).toEqual([]);
	});

	it("warns when container labels can't be read", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });
		mocks.execAsync.mockImplementation(async (command: string) => {
			if (command.includes("docker ps -aq")) throw new Error("docker down");
			return { stdout: JSON.stringify(routes), stderr: "" };
		});

		expect((await getUnusedTraefikCertificates()).routesComplete).toBe(false);
	});

	it("backs up acme.json before changing it and keeps only the last five backups", async () => {
		const backups = acmeBackupDirectory();
		vol.fromJSON({
			[LOCAL_ACME]: JSON.stringify(storage()),
			...Object.fromEntries(
				[1, 2, 3, 4, 5, 6].map((day) => [
					path.join(backups, `acme-2026-01-0${day}T00-00-00-000Z.json`),
					"old",
				]),
			),
		});

		await removeTraefikCertificates(undefined, [idOf("old.example.com")], {
			requireRoutes: false,
		});

		const files = (fs.readdirSync(backups) as string[]).sort();
		expect(files).toHaveLength(5);
		expect(files.slice(0, 4)).toEqual([
			"acme-2026-01-03T00-00-00-000Z.json",
			"acme-2026-01-04T00-00-00-000Z.json",
			"acme-2026-01-05T00-00-00-000Z.json",
			"acme-2026-01-06T00-00-00-000Z.json",
		]);
		const newest = path.join(backups, files[4] as string);
		expect(fs.readFileSync(newest, "utf8")).toBe(JSON.stringify(storage()));
		expect(fs.statSync(newest).mode & 0o777).toBe(0o600);
	});

	it("changes nothing when the backup can't be written", async () => {
		vol.fromJSON({
			[LOCAL_ACME]: JSON.stringify(storage()),
			[acmeBackupDirectory()]: "a file where the backup folder should be",
		});

		await expect(
			removeTraefikCertificates(undefined, [idOf("old.example.com")], {
				requireRoutes: false,
			}),
		).rejects.toThrow("Couldn't back up acme.json");
		expect(JSON.parse(fs.readFileSync(LOCAL_ACME, "utf8") as string)).toEqual(
			storage(),
		);
	});

	it("hands back an undo that restores acme.json exactly as it was", async () => {
		const original = `${JSON.stringify(storage())}\n`;
		vol.fromJSON({ [LOCAL_ACME]: original });
		mocks.whileTraefikStopped.mockImplementationOnce(
			async (_serverId, task, beforeStop) => {
				await beforeStop?.();
				const undo = await task();
				expect(fs.readFileSync(LOCAL_ACME, "utf8")).not.toBe(original);
				await (undo as () => Promise<void>)();
			},
		);

		await removeTraefikCertificates(undefined, [idOf("old.example.com")], {
			requireRoutes: false,
		});

		expect(fs.readFileSync(LOCAL_ACME, "utf8")).toBe(original);
	});

	it("counts the panel domain as in use only on the main server", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => ({
				stdout: command.startsWith("if [ -f") ? JSON.stringify(storage()) : "",
				stderr: "",
			}),
		);

		const remote = await getUnusedTraefikCertificates("server-1");

		expect(remote.certificates.map((c) => c.main)).toContain(
			"panel.example.com",
		);
	});

	it("reports a remote config file that exists but can't be read", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => {
				if (command.startsWith("for file in")) {
					throw new Error("cat: manual.yml: Permission denied");
				}
				return {
					stdout: command.startsWith("if [ -f")
						? JSON.stringify(storage())
						: command.includes("api/rawdata")
							? JSON.stringify(routes)
							: "",
					stderr: "",
				};
			},
		);

		const result = await getUnusedTraefikCertificates("server-1");

		expect(result.routesComplete).toBe(false);
		const configRead = mocks.execAsyncRemote.mock.calls.find(([, command]) =>
			String(command).startsWith("for file in"),
		);
		expect(configRead?.[1]).toBe(
			'for file in /etc/dokploy/traefik/dynamic/*.yml /etc/dokploy/traefik/dynamic/*.yaml /etc/dokploy/traefik/dynamic/*.toml; do [ -e "$file" ] || continue; cat -- "$file" || exit 1; done',
		);
	});

	it("doesn't restart Traefik when nothing selected can be removed anymore", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });
		mocks.state.hosts.push({ host: "old.example.com" });
		let goAhead: unknown;
		mocks.whileTraefikStopped.mockImplementationOnce(
			async (_serverId, task, beforeStop) => {
				goAhead = await beforeStop?.();
				if (goAhead !== false) await task();
			},
		);

		const removed = await removeTraefikCertificates(
			undefined,
			[idOf("old.example.com")],
			{ requireRoutes: false },
		);

		expect(goAhead).toBe(false);
		expect(removed).toBe(0);
		expect(fs.existsSync(acmeBackupDirectory())).toBe(false);
	});

	it("counts each removed certificate once, even when acme.json lists it twice", async () => {
		const data = storage();
		data.letsencrypt.Certificates.push({
			...data.letsencrypt.Certificates[0]!,
		});
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(data) });

		const removed = await removeTraefikCertificates(
			undefined,
			[idOf("old.example.com"), idOf("old.example.com")],
			{ requireRoutes: false },
		);

		expect(removed).toBe(1);
		const saved = JSON.parse(fs.readFileSync(LOCAL_ACME, "utf8") as string);
		expect(
			saved.letsencrypt.Certificates.map(
				(c: { domain: { main: string } }) => c.domain.main,
			),
		).not.toContain("old.example.com");
	});

	it("tells the user when it starts and records the restart for remote servers", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => ({
				stdout: command.startsWith("if [ -f") ? JSON.stringify(storage()) : "",
				stderr: "",
			}),
		);
		const onStarted = vi.fn();

		await removeTraefikCertificates("server-1", [idOf("old.example.com")], {
			requireRoutes: false,
			onStarted,
		});

		expect(onStarted).toHaveBeenCalledOnce();
		expect(mocks.state.restartUpdates).toEqual([expect.any(Date), null]);
	});

	it("leaves the restart recorded when it fails, so recovery checks the server", async () => {
		mocks.execAsyncRemote.mockImplementation(
			async (_serverId: string, command: string) => {
				if (command.startsWith("if [ -f")) throw new Error("ssh down");
				return { stdout: "", stderr: "" };
			},
		);

		await expect(
			removeTraefikCertificates("server-1", [idOf("old.example.com")], {
				requireRoutes: false,
			}),
		).rejects.toThrow("ssh down");
		expect(mocks.state.restartUpdates).toEqual([expect.any(Date)]);
	});

	it("leaves acme.json alone when none of the certificates are left", async () => {
		mocks.execAsyncRemote.mockResolvedValue({
			stdout: JSON.stringify(storage()),
			stderr: "",
		});

		await removeTraefikCertificates("server-1", [idOf("gone.example.com")], {
			requireRoutes: false,
		});

		expect(
			mocks.execAsyncRemote.mock.calls.some(([, command]) =>
				String(command).startsWith("umask 077"),
			),
		).toBe(false);
	});
});

describe("recoverInterruptedTraefikRestarts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mocks.state.restartUpdates = [];
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("checks only servers with a recorded restart, clears finished ones and retries busy ones later", async () => {
		mocks.state.pendingServers = [{ serverId: "a" }, { serverId: "b" }];
		mocks.restoreInterruptedTraefikOnServers
			.mockResolvedValueOnce({ done: ["a"], busy: ["b"] })
			.mockResolvedValueOnce({ done: ["b"], busy: [] });

		await recoverInterruptedTraefikRestarts();

		expect(mocks.restoreInterruptedTraefikOnServers).toHaveBeenCalledWith([
			"a",
			"b",
		]);
		expect(mocks.state.restartUpdates).toEqual([null]);

		mocks.state.pendingServers = [{ serverId: "b" }];
		await vi.advanceTimersByTimeAsync(5 * 60_000);

		expect(mocks.restoreInterruptedTraefikOnServers).toHaveBeenLastCalledWith([
			"b",
		]);
		expect(mocks.state.restartUpdates).toEqual([null, null]);
	});

	it("does nothing when no restart is recorded", async () => {
		mocks.state.pendingServers = [];

		await recoverInterruptedTraefikRestarts();

		expect(mocks.restoreInterruptedTraefikOnServers).not.toHaveBeenCalled();
	});
});
