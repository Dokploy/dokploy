import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

import { namecheapClient } from "@dokploy/server/utils/dns/namecheap";

const xmlResponse = (body: string, ok = true, status = 200) =>
	({
		ok,
		status,
		text: async () =>
			`<?xml version="1.0" encoding="utf-8"?><ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response"><Errors /><CommandResponse>${body}</CommandResponse></ApiResponse>`,
	}) as Response;

const errorResponse = (number: string, message: string) =>
	({
		ok: true,
		status: 200,
		text: async () =>
			`<?xml version="1.0" encoding="utf-8"?><ApiResponse Status="ERROR" xmlns="http://api.namecheap.com/xml.response"><Errors><Error Number="${number}">${message}</Error></Errors></ApiResponse>`,
	}) as Response;

const hostsResponse = (hosts: string, emailType = "FWD") =>
	xmlResponse(
		`<DomainDNSGetHostsResult Domain="example.com" EmailType="${emailType}" IsUsingOurDNS="true">${hosts}</DomainDNSGetHostsResult>`,
	);

const setHostsSuccess = () =>
	xmlResponse(
		'<DomainDNSSetHostsResult Domain="example.com" IsSuccess="true" />',
	);

const config = {
	providerType: "namecheap" as const,
	apiUser: "jdoe",
	apiKey: "secret-key",
	clientIp: "203.0.113.10",
};

const requestParams = (call: number) =>
	new URLSearchParams(
		(mockFetch.mock.calls[call]?.[1] as RequestInit).body as string,
	);

beforeEach(() => {
	mockFetch.mockReset();
});

describe("namecheapClient.listZones", () => {
	it("lists domains on Namecheap DNS and sends the global parameters", async () => {
		mockFetch.mockResolvedValue(
			xmlResponse(
				`<DomainGetListResult>
					<Domain ID="1" Name="example.com" IsOurDNS="true" />
					<Domain ID="2" Name="example.co.uk" IsOurDNS="true" />
					<Domain ID="3" Name="external.com" IsOurDNS="false" />
				</DomainGetListResult>
				<Paging><TotalItems>3</TotalItems><CurrentPage>1</CurrentPage><PageSize>100</PageSize></Paging>`,
			),
		);

		const zones = await namecheapClient.listZones(config);

		expect(zones).toEqual([
			{ id: "example.com", name: "example.com" },
			{ id: "example.co.uk", name: "example.co.uk" },
		]);
		const params = requestParams(0);
		expect(params.get("Command")).toBe("namecheap.domains.getList");
		expect(params.get("ApiUser")).toBe("jdoe");
		expect(params.get("UserName")).toBe("jdoe");
		expect(params.get("ApiKey")).toBe("secret-key");
		expect(params.get("ClientIp")).toBe("203.0.113.10");
		expect(params.get("PageSize")).toBe("100");
	});

	it("follows the paging until every domain is fetched", async () => {
		const page = (names: string[]) =>
			xmlResponse(
				`<DomainGetListResult>${names
					.map((name) => `<Domain Name="${name}" IsOurDNS="true" />`)
					.join(
						"",
					)}</DomainGetListResult><Paging><TotalItems>101</TotalItems></Paging>`,
			);
		mockFetch
			.mockResolvedValueOnce(
				page(Array.from({ length: 100 }, (_, i) => `d${i}.com`)),
			)
			.mockResolvedValueOnce(page(["last.com"]));

		const zones = await namecheapClient.listZones(config);

		expect(zones).toHaveLength(101);
		expect(requestParams(1).get("Page")).toBe("2");
	});
});

describe("namecheapClient.listRecords", () => {
	it("returns FQDN names and inlines the MX preference", async () => {
		mockFetch.mockResolvedValue(
			hostsResponse(
				`<host HostId="1" Name="@" Type="A" Address="1.2.3.4" MXPref="10" TTL="1800" />
				<host HostId="2" Name="www" Type="CNAME" Address="example.com." MXPref="10" TTL="1800" />
				<host HostId="3" Name="@" Type="MX" Address="mail.example.com." MXPref="20" TTL="1800" />
				<host HostId="4" Name="@" Type="TXT" Address="v=spf1 include:_spf.example.com &amp; ~all" MXPref="10" TTL="1800" />`,
			),
		);

		const records = await namecheapClient.listRecords(config, "example.com");

		expect(records.map(({ id: _, ...record }) => record)).toEqual([
			{ type: "A", name: "example.com", content: "1.2.3.4", ttl: 1800 },
			{
				type: "CNAME",
				name: "www.example.com",
				content: "example.com.",
				ttl: 1800,
			},
			{
				type: "MX",
				name: "example.com",
				content: "20 mail.example.com.",
				ttl: 1800,
			},
			{
				type: "TXT",
				name: "example.com",
				content: "v=spf1 include:_spf.example.com & ~all",
				ttl: 1800,
			},
		]);
		const params = requestParams(0);
		expect(params.get("Command")).toBe("namecheap.domains.dns.getHosts");
		expect(params.get("SLD")).toBe("example");
		expect(params.get("TLD")).toBe("com");
	});

	it("splits multi-label TLDs into SLD and TLD", async () => {
		mockFetch.mockResolvedValue(hostsResponse(""));

		await namecheapClient.listRecords(config, "example.co.uk");

		const params = requestParams(0);
		expect(params.get("SLD")).toBe("example");
		expect(params.get("TLD")).toBe("co.uk");
	});
});

describe("namecheapClient.upsertRecord", () => {
	it("appends the record and writes back every existing host", async () => {
		mockFetch
			.mockResolvedValueOnce(
				hostsResponse(
					'<host HostId="1" Name="@" Type="URL" Address="http://example.net" MXPref="10" TTL="1800" />',
				),
			)
			.mockResolvedValueOnce(setHostsSuccess());

		await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "A",
			name: "app.example.com",
			content: "5.6.7.8",
		});

		const params = requestParams(1);
		expect(params.get("Command")).toBe("namecheap.domains.dns.setHosts");
		expect(params.get("HostName1")).toBe("@");
		expect(params.get("RecordType1")).toBe("URL");
		expect(params.get("Address1")).toBe("http://example.net");
		expect(params.get("HostName2")).toBe("app");
		expect(params.get("RecordType2")).toBe("A");
		expect(params.get("Address2")).toBe("5.6.7.8");
		expect(params.get("TTL2")).toBe("1800");
		expect(params.get("EmailType")).toBe("FWD");
	});

	it("replaces a matching record instead of duplicating it", async () => {
		mockFetch
			.mockResolvedValueOnce(
				hostsResponse(
					'<host HostId="1" Name="www" Type="CNAME" Address="example.com." MXPref="10" TTL="1800" />',
				),
			)
			.mockResolvedValueOnce(setHostsSuccess());

		await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "CNAME",
			name: "www.example.com",
			content: "example.com",
			ttl: 300,
		});

		const params = requestParams(1);
		expect(params.get("HostName2")).toBeNull();
		expect(params.get("Address1")).toBe("example.com");
		expect(params.get("TTL1")).toBe("300");
	});

	it("switches the mail mode to MX when an MX record is written", async () => {
		mockFetch
			.mockResolvedValueOnce(hostsResponse("", "FWD"))
			.mockResolvedValueOnce(setHostsSuccess());

		await namecheapClient.upsertRecord(config, {
			zoneId: "example.com",
			type: "MX",
			name: "example.com",
			content: "10 mail.example.com",
		});

		const params = requestParams(1);
		expect(params.get("Address1")).toBe("mail.example.com");
		expect(params.get("MXPref1")).toBe("10");
		expect(params.get("EmailType")).toBe("MX");
	});

	it("rejects record types the Namecheap API cannot write", async () => {
		await expect(
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "SRV",
				name: "_sip._tcp.example.com",
				content: "1 10 5060 sip.example.com",
			}),
		).rejects.toThrow("SRV records are not supported");
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("fails when Namecheap does not confirm the update", async () => {
		mockFetch
			.mockResolvedValueOnce(hostsResponse(""))
			.mockResolvedValueOnce(
				xmlResponse(
					'<DomainDNSSetHostsResult Domain="example.com" IsSuccess="false" />',
				),
			);

		await expect(
			namecheapClient.upsertRecord(config, {
				zoneId: "example.com",
				type: "A",
				name: "example.com",
				content: "1.2.3.4",
			}),
		).rejects.toThrow("could not save the records of example.com");
	});
});

describe("namecheapClient.updateRecord / deleteRecord", () => {
	const hosts = `<host HostId="1" Name="@" Type="A" Address="1.2.3.4" MXPref="10" TTL="1800" />
		<host HostId="2" Name="app" Type="A" Address="5.6.7.8" MXPref="10" TTL="1800" />`;

	const recordIdFor = async (name: string) => {
		mockFetch.mockResolvedValueOnce(hostsResponse(hosts));
		const records = await namecheapClient.listRecords(config, "example.com");
		return records.find((record) => record.name === name)?.id as string;
	};

	it("replaces the record identified by the id", async () => {
		const id = await recordIdFor("app.example.com");
		mockFetch
			.mockResolvedValueOnce(hostsResponse(hosts))
			.mockResolvedValueOnce(setHostsSuccess());

		await namecheapClient.updateRecord(config, "example.com", id, {
			type: "A",
			name: "app.example.com",
			content: "9.9.9.9",
		});

		const params = requestParams(2);
		expect(params.get("Address1")).toBe("1.2.3.4");
		expect(params.get("Address2")).toBe("9.9.9.9");
	});

	it("removes only the record identified by the id", async () => {
		const id = await recordIdFor("app.example.com");
		mockFetch
			.mockResolvedValueOnce(hostsResponse(hosts))
			.mockResolvedValueOnce(setHostsSuccess());

		await namecheapClient.deleteRecord(config, "example.com", id);

		const params = requestParams(2);
		expect(params.get("HostName1")).toBe("@");
		expect(params.get("HostName2")).toBeNull();
	});

	it("fails without writing when the record no longer exists", async () => {
		const id = await recordIdFor("app.example.com");
		mockFetch.mockResolvedValueOnce(
			hostsResponse(
				'<host HostId="1" Name="@" Type="A" Address="1.2.3.4" MXPref="10" TTL="1800" />',
			),
		);

		await expect(
			namecheapClient.deleteRecord(config, "example.com", id),
		).rejects.toThrow("record not found");
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});
});

describe("namecheapClient concurrent writes", () => {
	// Simulates Namecheap's zone: getHosts reads it, setHosts replaces it.
	const fakeZones = () => {
		const zones = new Map<string, string[]>();
		mockFetch.mockImplementation(async (_url, init: RequestInit) => {
			const params = new URLSearchParams(init.body as string);
			const domain = `${params.get("SLD")}.${params.get("TLD")}`;
			await new Promise((resolve) => setTimeout(resolve, 5));
			if (params.get("Command") === "namecheap.domains.dns.setHosts") {
				const hosts: string[] = [];
				for (let n = 1; params.has(`HostName${n}`); n++) {
					hosts.push(
						`<host Name="${params.get(`HostName${n}`)}" Type="${params.get(`RecordType${n}`)}" Address="${params.get(`Address${n}`)}" MXPref="10" TTL="1800" />`,
					);
				}
				zones.set(domain, hosts);
				return setHostsSuccess();
			}
			return hostsResponse((zones.get(domain) ?? []).join(""));
		});
		return zones;
	};

	const upsert = (zoneId: string, name: string, content: string) =>
		namecheapClient.upsertRecord(config, {
			zoneId,
			type: "A",
			name,
			content,
		});

	it("keeps both changes when two writes to the same zone overlap", async () => {
		const zones = fakeZones();

		await Promise.all([
			upsert("example.com", "app.example.com", "1.1.1.1"),
			upsert("example.com", "api.example.com", "2.2.2.2"),
		]);

		const records = await namecheapClient.listRecords(config, "example.com");
		expect(records.map((record) => record.name).sort()).toEqual([
			"api.example.com",
			"app.example.com",
		]);
		expect(zones.get("example.com")).toHaveLength(2);
	});

	it("runs the next write after a failed one", async () => {
		fakeZones();
		const failing = namecheapClient.deleteRecord(
			config,
			"example.com",
			"missing",
		);
		const next = upsert("example.com", "app.example.com", "1.1.1.1");

		await expect(failing).rejects.toThrow("record not found");
		await expect(next).resolves.toBeDefined();
		const records = await namecheapClient.listRecords(config, "example.com");
		expect(records).toHaveLength(1);
	});
});

describe("namecheapClient.testConnection", () => {
	it("succeeds when the credentials can list domains", async () => {
		mockFetch.mockResolvedValue(xmlResponse("<DomainGetListResult />"));
		await expect(
			namecheapClient.testConnection(config),
		).resolves.toBeUndefined();
	});

	it("surfaces Namecheap's error message and code", async () => {
		mockFetch.mockResolvedValue(
			errorResponse("1011150", "Invalid request IP: 198.51.100.1"),
		);
		await expect(namecheapClient.testConnection(config)).rejects.toThrow(
			"Invalid request IP: 198.51.100.1 [1011150]",
		);
	});
});
