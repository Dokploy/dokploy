import { apiCreateServer, apiUpdateServer } from "@dokploy/server/db/schema";
import { normalizeIp } from "@dokploy/server/utils/ip-address";
import { describe, expect, it } from "vitest";

const validCreate = {
	name: "qa-server",
	description: "",
	ipAddress: "10.0.0.10",
	port: 22,
	username: "root",
	sshKeyId: "ssh-key-id",
	serverType: "deploy" as const,
	enableDockerCleanup: true,
};

const validUpdate = { ...validCreate, serverId: "server-id" };

describe("normalizeIp", () => {
	it("compresses and lowercases IPv6 addresses", () => {
		expect(normalizeIp("2001:0DB8:0:0:0:0:0:50")).toBe("2001:db8::50");
		expect(normalizeIp("2001:db8::50")).toBe("2001:db8::50");
	});

	it("leaves IPv4 addresses untouched", () => {
		expect(normalizeIp(" 10.0.0.50 ")).toBe("10.0.0.50");
	});

	it("returns values that are not IPv6 addresses unchanged", () => {
		expect(normalizeIp("not:an:ip")).toBe("not:an:ip");
	});
});

describe("server ingressIps schema", () => {
	it("normalizes IPv6 addresses when updating a server", () => {
		const result = apiUpdateServer.safeParse({
			...validUpdate,
			ingressIps: ["10.0.0.50", "2001:0DB8:0:0:0:0:0:50"],
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.ingressIps).toEqual(["10.0.0.50", "2001:db8::50"]);
		}
	});

	it("normalizes IPv6 addresses when creating a server", () => {
		const result = apiCreateServer.safeParse({
			...validCreate,
			ingressIps: ["2001:0DB8:0:0:0:0:0:50"],
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.ingressIps).toEqual(["2001:db8::50"]);
		}
	});

	it("leaves ingressIps undefined when it is omitted", () => {
		const result = apiUpdateServer.safeParse(validUpdate);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.ingressIps).toBeUndefined();
		}
	});

	it("rejects values that are not IP addresses", () => {
		const result = apiUpdateServer.safeParse({
			...validUpdate,
			ingressIps: ["10.0.0.50", "not-an-ip"],
		});

		expect(result.success).toBe(false);
	});

	it("accepts up to 16 addresses and rejects more", () => {
		const ips = (count: number) =>
			Array.from({ length: count }, (_, index) => `10.0.0.${index + 1}`);

		expect(
			apiUpdateServer.safeParse({ ...validUpdate, ingressIps: ips(16) })
				.success,
		).toBe(true);
		expect(
			apiUpdateServer.safeParse({ ...validUpdate, ingressIps: ips(17) })
				.success,
		).toBe(false);
	});
});
