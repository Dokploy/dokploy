import path from "node:path";
import { fs, vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	hosts: [] as { host: string }[],
	whileTraefikStopped: vi.fn(
		async (_serverId: string | undefined, task: () => Promise<void>) => task(),
	),
}));

vi.mock("node:fs", () => ({ ...fs, default: fs }));

vi.mock("@dokploy/server/db", () => ({
	db: { select: () => ({ from: async () => mocks.hosts }) },
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
}));

import {
	addTraefikRouteNames,
	findRemovableTraefikCertificates,
	findUnusedAcmeCertificates,
	getUnusedTraefikCertificates,
	listAcmeCertificates,
	parseAcmeStorage,
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

const used = () => ({ hosts: new Set<string>(), patterns: [] as RegExp[] });

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
					{ domain: { main: "A.example.com." } },
				],
			},
			broken: { Certificates: "nope" },
			empty: null,
		});

		expect(certificates).toEqual([
			{
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

describe("withoutAcmeCertificates", () => {
	it("removes only the given certificates and keeps the account and other resolvers", () => {
		const data = storage();

		const removed = withoutAcmeCertificates(data, [
			{ resolver: "letsencrypt", main: "OLD.example.com" },
			{ resolver: "cloudflare", main: "old.example.com" },
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
		mocks.hosts = [{ host: "App.Example.com" }];
	});

	it("lists certificates no domain, route or panel uses, soonest expiry first", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });
		mocks.execAsync.mockResolvedValue({
			stdout: JSON.stringify(routes),
			stderr: "",
		});

		const result = await getUnusedTraefikCertificates();

		expect(result).toEqual({
			routesAvailable: true,
			certificates: [
				{
					resolver: "letsencrypt",
					main: "old.example.com",
					sans: [],
					expiresAt: "2026-11-06T15:43:28.000Z",
				},
				{
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

		expect(result.routesAvailable).toBe(false);
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
			{ resolver: "letsencrypt", main: "old.example.com" },
			{ resolver: "letsencrypt", main: "app.example.com" },
			{ resolver: "letsencrypt", main: "gone.example.com" },
		]);

		expect(removable).toEqual([
			{ resolver: "letsencrypt", main: "old.example.com" },
		]);
	});

	it("rewrites the local acme.json while Traefik is stopped, readable only by its owner", async () => {
		vol.fromJSON({ [LOCAL_ACME]: JSON.stringify(storage()) });

		await removeTraefikCertificates(undefined, [
			{ resolver: "letsencrypt", main: "old.example.com" },
		]);

		expect(mocks.whileTraefikStopped).toHaveBeenCalledWith(
			undefined,
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

		await removeTraefikCertificates("server-1", [
			{ resolver: "letsencrypt", main: "old.example.com" },
		]);

		const write = mocks.execAsyncRemote.mock.calls.find(([, command]) =>
			String(command).startsWith("umask 077"),
		);
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
			async (_serverId, task) => {
				mocks.hosts.push({ host: "old.example.com" });
				await task();
			},
		);

		await removeTraefikCertificates(undefined, [
			{ resolver: "letsencrypt", main: "old.example.com" },
		]);

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
				if (command.startsWith("umask 077")) {
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
			removeTraefikCertificates("server-1", [
				{ resolver: "letsencrypt", main: "old.example.com" },
			]),
		).rejects.toThrow(
			"Couldn't write /etc/dokploy/traefik/dynamic/acme.json: No space left on device",
		);
	});

	it("leaves acme.json alone when none of the certificates are left", async () => {
		mocks.execAsyncRemote.mockResolvedValue({
			stdout: JSON.stringify(storage()),
			stderr: "",
		});

		await removeTraefikCertificates("server-1", [
			{ resolver: "letsencrypt", main: "gone.example.com" },
		]);

		expect(
			mocks.execAsyncRemote.mock.calls.some(([, command]) =>
				String(command).startsWith("umask 077"),
			),
		).toBe(false);
	});
});
