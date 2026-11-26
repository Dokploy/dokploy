import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { namecheapClient } from "@dokploy/server/utils/dns/namecheap";

interface Host {
	id: string;
	name: string;
	type: string;
	address: string;
	mxPref?: string;
	ttl?: string;
}

const config = {
	providerType: "namecheap" as const,
	apiUser: "dokploy-user",
	apiKey: "nc-key",
	clientIp: "203.0.113.10",
	sandbox: false,
};

const escapeXml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");

const xmlResponse = (body: string, ok = true, status = 200) =>
	({ ok, status, text: async () => body }) as Response;

const apiOk = (command: string, result: string) =>
	xmlResponse(`<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
  <Errors />
  <Warnings />
  <RequestedCommand>${command.toLowerCase()}</RequestedCommand>
  <CommandResponse Type="${command}">
    ${result}
  </CommandResponse>
  <Server>TEST01</Server>
  <GMTTimeDifference>--5:00</GMTTimeDifference>
  <ExecutionTime>0.012</ExecutionTime>
</ApiResponse>`);

const apiError = (message: string, number: string) =>
	xmlResponse(`<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="ERROR" xmlns="http://api.namecheap.com/xml.response">
  <Errors>
    <Error Number="${number}">${message}</Error>
  </Errors>
  <Warnings />
  <RequestedCommand>namecheap.domains.getlist</RequestedCommand>
  <Server>TEST01</Server>
  <GMTTimeDifference>--5:00</GMTTimeDifference>
  <ExecutionTime>0.004</ExecutionTime>
</ApiResponse>`);

const hostsResponse = (
	hosts: Host[],
	{ emailType = "", isUsingOurDns = "true", domain = "example.com" } = {},
) =>
	apiOk(
		"namecheap.domains.dns.getHosts",
		`<DomainDNSGetHostsResult Domain="${domain}" EmailType="${emailType}" IsUsingOurDNS="${isUsingOurDns}">${hosts
			.map(
				(host) =>
					`<host HostId="${host.id}" Name="${host.name}" Type="${host.type}" Address="${escapeXml(host.address)}" MXPref="${host.mxPref ?? "10"}" TTL="${host.ttl ?? "1799"}" AssociatedAppTitle="" FriendlyName="" IsActive="true" IsDDNSEnabled="false" />`,
			)
			.join("")}</DomainDNSGetHostsResult>`,
	);

const setHostsResponse = (isSuccess = "true") =>
	apiOk(
		"namecheap.domains.dns.setHosts",
		`<DomainDNSSetHostsResult Domain="example.com" IsSuccess="${isSuccess}"><Warnings /></DomainDNSSetHostsResult>`,
	);

const domainsResponse = (
	domains: { name: string; isOurDns?: string }[],
	totalItems: number,
) =>
	apiOk(
		"namecheap.domains.getList",
		`<DomainGetListResult>${domains
			.map(
				(domain) =>
					`<Domain ID="1" Name="${domain.name}" User="dokploy-user" Created="01/01/2026" Expires="01/01/2027" IsExpired="false" IsLocked="false" AutoRenew="true" WhoisGuard="ENABLED" IsPremium="false" IsOurDNS="${domain.isOurDns ?? "true"}" />`,
			)
			.join(
				"",
			)}</DomainGetListResult><Paging><TotalItems>${totalItems}</TotalItems><CurrentPage>1</CurrentPage><PageSize>100</PageSize></Paging>`,
	);

const request = (index: number) => {
	const [url, init] = mockFetch.mock.calls[index] as [string, RequestInit];
	return {
		url,
		method: init.method,
		headers: init.headers,
		params: new URLSearchParams(init.body as URLSearchParams),
	};
};

const commands = () =>
	mockFetch.mock.calls.map(([, init]) =>
		new URLSearchParams((init as RequestInit).body as URLSearchParams).get(
			"Command",
		),
	);

const writtenHosts = (params: URLSearchParams) => {
	const hosts: Omit<Host, "id">[] = [];
	for (let n = 1; params.has(`RecordType${n}`); n += 1) {
		hosts.push({
			name: params.get(`HostName${n}`) ?? "",
			type: params.get(`RecordType${n}`) ?? "",
			address: params.get(`Address${n}`) ?? "",
			...(params.has(`MXPref${n}`) && {
				mxPref: params.get(`MXPref${n}`) as string,
			}),
			...(params.has(`TTL${n}`) && { ttl: params.get(`TTL${n}`) as string }),
		});
	}
	return hosts;
};

// Behaves like the API for one domain: setHosts replaces every record and
// hands out new HostIds, and MX records are dropped unless EmailType is MX.
const fakeZone = (initial: Host[], { emailType = "" } = {}) => {
	const zone = { hosts: initial, emailType, writes: [] as URLSearchParams[] };
	let nextId = 100;
	mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
		const params = new URLSearchParams(init.body as URLSearchParams);
		const command = params.get("Command");
		if (command === "namecheap.domains.dns.getHosts") {
			return hostsResponse(zone.hosts, { emailType: zone.emailType });
		}
		if (command === "namecheap.domains.dns.setHosts") {
			zone.writes.push(params);
			zone.emailType = params.get("EmailType") ?? zone.emailType;
			zone.hosts = writtenHosts(params)
				.filter((host) => host.type !== "MX" || zone.emailType === "MX")
				.map((host) => ({
					...host,
					id: String(nextId++),
					ttl: host.ttl ?? "1799",
				}));
			return setHostsResponse();
		}
		throw new Error(`unexpected command ${command}`);
	});
	return zone;
};

const existingHosts: Host[] = [
	{ id: "1", name: "@", type: "A", address: "1.2.3.4", ttl: "1800" },
	{
		id: "2",
		name: "@",
		type: "TXT",
		address: 'v=spf1 include:_spf.example.net "quoted" & more ~all',
	},
	{ id: "3", name: "www", type: "CNAME", address: "example.com." },
	{ id: "4", name: "old", type: "URL301", address: "https://example.org" },
];

beforeEach(() => {
	mockFetch.mockReset();
});

describe("namecheapClient requests", () => {
	it("sends the credentials and command as a form-encoded POST", async () => {
		mockFetch.mockResolvedValue(domainsResponse([], 0));

		await namecheapClient.testConnection(config);

		const { url, method, headers, params } = request(0);
		expect(url).toBe("https://api.namecheap.com/xml.response");
		expect(method).toBe("POST");
		expect(headers).toMatchObject({
			"Content-Type": "application/x-www-form-urlencoded",
		});
		expect(Object.fromEntries(params)).toEqual({
			ApiUser: "dokploy-user",
			ApiKey: "nc-key",
			UserName: "dokploy-user",
			ClientIp: "203.0.113.10",
			Command: "namecheap.domains.getList",
			PageSize: "10",
		});
	});

	it("uses the sandbox endpoint when asked to", async () => {
		mockFetch.mockResolvedValue(domainsResponse([], 0));

		await namecheapClient.testConnection({ ...config, sandbox: true });

		expect(request(0).url).toBe(
			"https://api.sandbox.namecheap.com/xml.response",
		);
	});

	it("trims whitespace pasted into the credentials", async () => {
		mockFetch.mockResolvedValue(domainsResponse([], 0));

		await namecheapClient.testConnection({
			...config,
			apiUser: " dokploy-user ",
			apiKey: "nc-key\n",
			clientIp: " 203.0.113.10",
		});

		const { params } = request(0);
		expect(params.get("ApiUser")).toBe("dokploy-user");
		expect(params.get("ApiKey")).toBe("nc-key");
		expect(params.get("ClientIp")).toBe("203.0.113.10");
	});

	it("surfaces Namecheap's error message and number", async () => {
		mockFetch.mockResolvedValue(
			apiError("Invalid request IP: 203.0.113.10", "1011150"),
		);

		await expect(namecheapClient.testConnection(config)).rejects.toThrow(
			"Namecheap: namecheap.domains.getList failed: Invalid request IP: 203.0.113.10 (1011150)",
		);
	});

	it("reports an HTTP failure by its status", async () => {
		mockFetch.mockResolvedValue(xmlResponse("", false, 503));

		await expect(namecheapClient.testConnection(config)).rejects.toThrow(
			"(status 503)",
		);
	});

	it("rejects a response that is not an API response", async () => {
		mockFetch.mockResolvedValue(xmlResponse("<html>Access denied</html>"));

		await expect(namecheapClient.testConnection(config)).rejects.toThrow(
			"returned an unexpected response",
		);
	});
});

describe("namecheapClient.listZones", () => {
	it("lists only the domains that use Namecheap's DNS servers", async () => {
		mockFetch.mockResolvedValue(
			domainsResponse(
				[
					{ name: "example.com" },
					{ name: "elsewhere.com", isOurDns: "false" },
					{ name: "example.co.uk" },
				],
				3,
			),
		);

		const zones = await namecheapClient.listZones(config);

		expect(zones).toEqual([
			{ id: "example.com", name: "example.com" },
			{ id: "example.co.uk", name: "example.co.uk" },
		]);
		expect(Object.fromEntries(request(0).params)).toMatchObject({
			Command: "namecheap.domains.getList",
			ListType: "ALL",
			Page: "1",
			PageSize: "100",
		});
	});

	it("pages through accounts with more domains than fit on one page", async () => {
		const page = (start: number, count: number) =>
			Array.from({ length: count }, (_, i) => ({
				name: `domain${start + i}.com`,
			}));
		mockFetch
			.mockResolvedValueOnce(domainsResponse(page(0, 100), 101))
			.mockResolvedValueOnce(domainsResponse(page(100, 1), 101));

		const zones = await namecheapClient.listZones(config);

		expect(zones).toHaveLength(101);
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(request(1).params.get("Page")).toBe("2");
	});

	it("continues paging when TotalItems is empty or the server returns smaller pages", async () => {
		const page = (start: number, count: number) =>
			Array.from({ length: count }, (_, i) => ({
				name: `domain${start + i}.com`,
			}));
		const emptyTotalPage = (domains: { name: string }[]) =>
			apiOk(
				"namecheap.domains.getList",
				`<DomainGetListResult>${domains
					.map(
						(domain) =>
							`<Domain ID="1" Name="${domain.name}" IsOurDNS="true" />`,
					)
					.join(
						"",
					)}</DomainGetListResult><Paging><TotalItems></TotalItems></Paging>`,
			);

		mockFetch
			.mockResolvedValueOnce(emptyTotalPage(page(0, 100)))
			.mockResolvedValueOnce(emptyTotalPage(page(100, 2)));

		const zones = await namecheapClient.listZones(config);

		expect(zones).toHaveLength(102);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});
});

describe("namecheapClient.listRecords", () => {
	it("converts hosts to Dokploy's fully-qualified format", async () => {
		mockFetch.mockResolvedValue(
			hostsResponse([
				{ id: "1", name: "@", type: "A", address: "1.2.3.4", ttl: "1800" },
				{ id: "2", name: "www", type: "CNAME", address: "example.com." },
				{
					id: "3",
					name: "@",
					type: "MX",
					address: "mail.example.com.",
					mxPref: "20",
				},
				{
					id: "4",
					name: "@",
					type: "CAA",
					address: '0 issue "letsencrypt.org"',
				},
				{ id: "5", name: "@", type: "TXT", address: 'say "hi" & <bye>' },
			]),
		);

		const records = await namecheapClient.listRecords(config, "example.com");

		expect(records).toEqual([
			{
				id: expect.stringMatching(/^[0-9a-f]{24}:0$/),
				type: "A",
				name: "example.com",
				content: "1.2.3.4",
				ttl: 1800,
			},
			{
				id: expect.stringMatching(/^[0-9a-f]{24}:0$/),
				type: "CNAME",
				name: "www.example.com",
				content: "example.com",
				ttl: 1799,
			},
			{
				id: expect.stringMatching(/^[0-9a-f]{24}:0$/),
				type: "MX",
				name: "example.com",
				content: "20 mail.example.com",
				ttl: 1799,
			},
			{
				id: expect.stringMatching(/^[0-9a-f]{24}:0$/),
				type: "CAA",
				name: "example.com",
				content: '0 issue "letsencrypt.org"',
				ttl: 1799,
			},
			{
				id: expect.stringMatching(/^[0-9a-f]{24}:0$/),
				type: "TXT",
				name: "example.com",
				content: 'say "hi" & <bye>',
				ttl: 1799,
			},
		]);
		expect(new Set(records.map((record) => record.id)).size).toBe(5);
	});

	it("splits a multi-label TLD into the SLD and TLD", async () => {
		mockFetch.mockResolvedValue(hostsResponse([], { domain: "example.co.uk" }));

		await namecheapClient.listRecords(config, "example.co.uk");

		expect(Object.fromEntries(request(0).params)).toMatchObject({
			Command: "namecheap.domains.dns.getHosts",
			SLD: "example",
			TLD: "co.uk",
		});
	});

	it.each(["localhost", ".example.com", "example..com"])(
		"rejects an invalid domain name %j before calling the API",
		async (zone) => {
			await expect(namecheapClient.listRecords(config, zone)).rejects.toThrow(
				"is not a registered domain",
			);
			expect(mockFetch).not.toHaveBeenCalled();
		},
	);

	it("refuses a domain that does not use Namecheap's DNS servers", async () => {
		mockFetch.mockResolvedValue(hostsResponse([], { isUsingOurDns: "false" }));

		await expect(
			namecheapClient.listRecords(config, "example.com"),
		).rejects.toThrow("does not use Namecheap's DNS servers");
	});
});

describe("namecheapClient.upsertRecord", () => {
	it("adds the record and writes every existing record back unchanged", async () => {
		const zone = fakeZone(existingHosts);

		const result = await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "5.6.7.8",
			ttl: 300,
		});

		expect(commands()).toEqual([
			"namecheap.domains.dns.getHosts",
			"namecheap.domains.dns.setHosts",
			"namecheap.domains.dns.getHosts",
		]);
		const write = zone.writes[0] as URLSearchParams;
		expect(write.get("SLD")).toBe("example");
		expect(write.get("TLD")).toBe("com");
		expect(write.has("EmailType")).toBe(false);
		expect(writtenHosts(write)).toEqual([
			{ name: "@", type: "A", address: "1.2.3.4", ttl: "1800" },
			{
				name: "@",
				type: "TXT",
				address: 'v=spf1 include:_spf.example.net "quoted" & more ~all',
				ttl: "1799",
			},
			{ name: "www", type: "CNAME", address: "example.com.", ttl: "1799" },
			{
				name: "old",
				type: "URL301",
				address: "https://example.org",
				ttl: "1799",
			},
			{ name: "app", type: "A", address: "5.6.7.8", ttl: "300" },
		]);
		const listed = await namecheapClient.listRecords(config, "example.com");
		const created = listed.find((record) => record.name === "app.example.com");
		expect(result).toEqual({ id: created?.id });
	});

	it("uses @ for the apex and leaves the TTL to Namecheap when unset", async () => {
		const zone = fakeZone([]);

		await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "TXT",
			name: "Example.COM",
			content: "hello",
		});

		expect(writtenHosts(zone.writes[0] as URLSearchParams)).toEqual([
			{ name: "@", type: "TXT", address: "hello" },
		]);
	});

	it("updates the matching record in place instead of adding a duplicate", async () => {
		const zone = fakeZone(existingHosts);

		await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "CNAME",
			name: "WWW.example.com",
			content: "Example.com",
			ttl: 600,
		});

		const cnames = writtenHosts(zone.writes[0] as URLSearchParams).filter(
			(host) => host.type === "CNAME",
		);
		expect(cnames).toEqual([
			{ name: "WWW", type: "CNAME", address: "Example.com", ttl: "600" },
		]);
	});

	it("sends CAA values quoted in presentation format and preserves issuer parameters", async () => {
		const zone = fakeZone([]);

		await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "CAA",
			name: "example.com",
			content: '0 ISSUE "letsencrypt.org; validationmethods=dns-01"',
		});

		expect(writtenHosts(zone.writes[0] as URLSearchParams)).toEqual([
			{
				name: "@",
				type: "CAA",
				address: '0 issue "letsencrypt.org; validationmethods=dns-01"',
			},
		]);
	});

	it("quotes an unquoted CAA value and supports a lone semicolon", async () => {
		const zone = fakeZone([]);

		await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "CAA",
			name: "example.com",
			content: "0 issue ;",
		});

		expect(writtenHosts(zone.writes[0] as URLSearchParams)).toEqual([
			{ name: "@", type: "CAA", address: '0 issue ";"' },
		]);
	});

	it("matches AAAA records case-insensitively on read-back", async () => {
		mockFetch
			.mockResolvedValueOnce(hostsResponse([]))
			.mockResolvedValueOnce(setHostsResponse())
			.mockResolvedValueOnce(
				hostsResponse([
					{ id: "42", name: "app", type: "AAAA", address: "2001:db8::1" },
				]),
			);

		const result = await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "AAAA",
			name: "app.example.com",
			content: "2001:DB8::1",
		});

		expect(result.id).toMatch(/^[0-9a-f]{24}:0$/);
	});

	it("moves a domain without a mail setting to MX when adding an MX record", async () => {
		const zone = fakeZone(existingHosts);

		await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "MX",
			name: "example.com",
			content: "020 mail.example.com",
		});

		const write = zone.writes[0] as URLSearchParams;
		expect(write.get("EmailType")).toBe("MX");
		expect(writtenHosts(write).at(-1)).toEqual({
			name: "@",
			type: "MX",
			address: "mail.example.com",
			mxPref: "20",
		});
		expect(zone.hosts.some((host) => host.type === "MX")).toBe(true);
	});

	it("preserves MX priority 0 instead of falling back to the default", async () => {
		const zone = fakeZone([], { emailType: "MX" });

		await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "MX",
			name: "example.com",
			content: "0 mail.example.com",
		});

		expect(writtenHosts(zone.writes[0] as URLSearchParams)).toEqual([
			{ name: "@", type: "MX", address: "mail.example.com", mxPref: "0" },
		]);
	});

	it("keeps the MX mail setting so existing MX records survive an unrelated change", async () => {
		const zone = fakeZone(
			[
				{
					id: "9",
					name: "@",
					type: "MX",
					address: "mail.example.com.",
					mxPref: "10",
				},
			],
			{ emailType: "MX" },
		);

		await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "5.6.7.8",
		});

		const write = zone.writes[0] as URLSearchParams;
		expect(write.get("EmailType")).toBe("MX");
		expect(write.get("MXPref1")).toBe("10");
		expect(zone.hosts.map((host) => host.type)).toEqual(["MX", "A"]);
	});

	it("refuses to add an MX record over a mail preset without writing anything", async () => {
		const zone = fakeZone(existingHosts, { emailType: "FWD" });

		await expect(
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "MX",
				name: "example.com",
				content: "10 mail.example.com",
			}),
		).rejects.toThrow('uses the "FWD" mail setting');
		expect(zone.writes).toHaveLength(0);
	});

	it.each(["SRV", "PTR"] as const)(
		"rejects %s records before calling the API",
		async (type) => {
			await expect(
				namecheapClient.upsertRecord(config, {
					zoneId: "example.com",
					type,
					name: "x.example.com",
					content: "1 10 5060 sip.example.com",
				}),
			).rejects.toThrow(`the API does not support ${type} records`);
			expect(mockFetch).not.toHaveBeenCalled();
		},
	);

	it("rejects a TTL outside Namecheap's range before calling the API", async () => {
		await expect(
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "A",
				name: "app.example.com",
				content: "1.2.3.4",
				ttl: 30,
			}),
		).rejects.toThrow("the TTL must be between 60 and 60000 seconds");
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it.each([
		'"letsencrypt.org"',
		'0 issue "letsencrypt.org',
		'0 issue letsencrypt.org"',
		'256 issue "letsencrypt.org"',
	])(
		"rejects a malformed CAA value %j before calling the API",
		async (content) => {
			await expect(
				namecheapClient.upsertRecord(config, {
					zoneId: "example.com",
					type: "CAA",
					name: "example.com",
					content,
				}),
			).rejects.toThrow('a CAA value must be `flags tag "value"`');
			expect(mockFetch).not.toHaveBeenCalled();
		},
	);

	it("fails when Namecheap does not apply the write", async () => {
		mockFetch
			.mockResolvedValueOnce(hostsResponse(existingHosts))
			.mockResolvedValueOnce(setHostsResponse("false"));

		await expect(
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "A",
				name: "app.example.com",
				content: "5.6.7.8",
			}),
		).rejects.toThrow("the changes to example.com were not applied");
	});

	it("fails when the written record is missing from the zone afterwards", async () => {
		mockFetch
			.mockResolvedValueOnce(hostsResponse(existingHosts))
			.mockResolvedValueOnce(setHostsResponse())
			.mockResolvedValueOnce(hostsResponse(existingHosts));

		await expect(
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "A",
				name: "app.example.com",
				content: "5.6.7.8",
			}),
		).rejects.toThrow("was not found when reading it back");
	});

	it("never writes when the zone could not be read", async () => {
		mockFetch.mockResolvedValue(apiOk("namecheap.domains.dns.getHosts", ""));

		await expect(
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "A",
				name: "app.example.com",
				content: "5.6.7.8",
			}),
		).rejects.toThrow("getHosts returned no records for example.com");
		expect(commands()).toEqual(["namecheap.domains.dns.getHosts"]);
	});

	it("queues concurrent changes to a domain so neither is lost", async () => {
		const zone = fakeZone(existingHosts);

		await Promise.all([
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "A",
				name: "one.example.com",
				content: "1.1.1.1",
			}),
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "A",
				name: "two.example.com",
				content: "2.2.2.2",
			}),
		]);

		expect(zone.hosts.map((host) => host.name)).toEqual([
			"@",
			"@",
			"www",
			"old",
			"one",
			"two",
		]);
	});

	it("keeps processing queued changes after one of them fails", async () => {
		const zone = fakeZone(existingHosts, { emailType: "FWD" });

		const results = await Promise.allSettled([
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "MX",
				name: "example.com",
				content: "10 mail.example.com",
			}),
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "A",
				name: "app.example.com",
				content: "5.6.7.8",
			}),
		]);

		expect(results.map((result) => result.status)).toEqual([
			"rejected",
			"fulfilled",
		]);
		expect(zone.hosts.some((host) => host.name === "app")).toBe(true);
	});
});

describe("namecheapClient.updateRecord", () => {
	it("replaces the record with the given id, even across types", async () => {
		const zone = fakeZone(existingHosts);
		const apexA = (
			await namecheapClient.listRecords(config, "example.com")
		).find((record) => record.type === "A");
		expect(apexA).toBeDefined();

		const result = await namecheapClient.updateRecord(
			config,
			"example.com",
			apexA!.id,
			{ type: "CNAME", name: "example.com", content: "target.example.net" },
		);

		expect(writtenHosts(zone.writes[0] as URLSearchParams)).toEqual([
			{ name: "@", type: "CNAME", address: "target.example.net" },
			{
				name: "@",
				type: "TXT",
				address: 'v=spf1 include:_spf.example.net "quoted" & more ~all',
				ttl: "1799",
			},
			{ name: "www", type: "CNAME", address: "example.com.", ttl: "1799" },
			{
				name: "old",
				type: "URL301",
				address: "https://example.org",
				ttl: "1799",
			},
		]);
		const listed = await namecheapClient.listRecords(config, "example.com");
		const replaced = listed.find(
			(record) => record.content === "target.example.net",
		);
		expect(result).toEqual({ id: replaced?.id });
	});

	it("keeps a record's id valid after another record is deleted or added", async () => {
		const zone = fakeZone(existingHosts);
		const initial = await namecheapClient.listRecords(config, "example.com");
		const apexA = initial.find((record) => record.type === "A")!;
		const wwwCname = initial.find((record) => record.type === "CNAME")!;

		// Deleting another record makes Namecheap reassign every HostId in the zone.
		await namecheapClient.deleteRecord(config, "example.com", wwwCname.id);
		expect(zone.hosts.every((host) => Number(host.id) >= 100)).toBe(true);

		// An open edit holding the pre-delete id still saves cleanly.
		const updated = await namecheapClient.updateRecord(
			config,
			"example.com",
			apexA.id,
			{ type: "A", name: "example.com", content: "9.9.9.9", ttl: 300 },
		);

		expect(zone.hosts.find((host) => host.type === "A")?.address).toBe(
			"9.9.9.9",
		);
		const after = await namecheapClient.listRecords(config, "example.com");
		expect(updated).toEqual({
			id: after.find((record) => record.type === "A")?.id,
		});
	});

	it("refuses a record id that is no longer in the zone", async () => {
		const zone = fakeZone(existingHosts);

		await expect(
			namecheapClient.updateRecord(config, "example.com", "999", {
				type: "A",
				name: "example.com",
				content: "9.9.9.9",
			}),
		).rejects.toThrow("record 999 no longer exists in example.com");
		expect(zone.writes).toHaveLength(0);
	});
});

describe("namecheapClient.deleteRecord", () => {
	it("removes only the given record", async () => {
		const zone = fakeZone(existingHosts);
		const wwwCname = (
			await namecheapClient.listRecords(config, "example.com")
		).find((record) => record.type === "CNAME")!;
		mockFetch.mockClear();

		await namecheapClient.deleteRecord(config, "example.com", wwwCname.id);

		expect(zone.hosts.map((host) => host.type)).toEqual(["A", "TXT", "URL301"]);
		expect(commands()).toEqual([
			"namecheap.domains.dns.getHosts",
			"namecheap.domains.dns.setHosts",
		]);
	});

	it("assigns distinct ids to duplicate records and deletes only the targeted one", async () => {
		const zone = fakeZone([
			{ id: "1", name: "@", type: "TXT", address: "dup", ttl: "600" },
			{ id: "2", name: "@", type: "TXT", address: "dup", ttl: "1800" },
		]);
		const records = await namecheapClient.listRecords(config, "example.com");
		expect(records).toHaveLength(2);
		expect(records[0]!.id).not.toBe(records[1]!.id);

		await namecheapClient.deleteRecord(config, "example.com", records[1]!.id);

		expect(zone.hosts).toHaveLength(1);
		expect(zone.hosts[0]?.ttl).toBe("600");
	});

	it("refuses a record id that is no longer in the zone", async () => {
		const zone = fakeZone(existingHosts);

		await expect(
			namecheapClient.deleteRecord(config, "example.com", "999"),
		).rejects.toThrow("record 999 no longer exists in example.com");
		expect(zone.writes).toHaveLength(0);
	});
});
