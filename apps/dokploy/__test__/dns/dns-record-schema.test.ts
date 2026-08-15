import { describe, expect, it } from "vitest";
import {
	apiCreateDnsRecord,
	apiUpdateDnsRecord,
} from "@dokploy/server/db/schema";

const base = {
	dnsProviderId: "prov-1",
	zoneId: "zone-1",
	type: "A" as const,
	name: "app.example.com",
	content: "1.2.3.4",
};

describe("apiCreateDnsRecord", () => {
	it("accepts optional proxied", () => {
		expect(apiCreateDnsRecord.parse({ ...base, proxied: true }).proxied).toBe(
			true,
		);
		expect(apiCreateDnsRecord.parse({ ...base, proxied: false }).proxied).toBe(
			false,
		);
	});

	it("allows omitting proxied", () => {
		expect(apiCreateDnsRecord.parse(base).proxied).toBeUndefined();
	});
});

describe("apiUpdateDnsRecord", () => {
	it("accepts optional proxied", () => {
		const parsed = apiUpdateDnsRecord.parse({
			...base,
			recordId: "r1",
			proxied: false,
		});
		expect(parsed.proxied).toBe(false);
	});
});
