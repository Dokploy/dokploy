import { applyAdditionalPortBindings } from "@dokploy/server/setup/traefik-setup";
import { describe, expect, it } from "vitest";

describe("applyAdditionalPortBindings", () => {
	it("keeps every published port sharing one target port", () => {
		const exposedPorts: Record<string, {}> = {};
		const portBindings: Record<string, Array<{ HostPort: string }>> = {};

		applyAdditionalPortBindings(exposedPorts, portBindings, [
			{ targetPort: 80, publishedPort: 8085, protocol: "tcp" },
			{ targetPort: 80, publishedPort: 8888, protocol: "tcp" },
		]);

		expect(portBindings["80/tcp"]).toEqual([
			{ HostPort: "8085" },
			{ HostPort: "8888" },
		]);
		expect(exposedPorts["80/tcp"]).toEqual({});
	});

	it("keeps protocols on the same target port separate", () => {
		const exposedPorts: Record<string, {}> = {};
		const portBindings: Record<string, Array<{ HostPort: string }>> = {};

		applyAdditionalPortBindings(exposedPorts, portBindings, [
			{ targetPort: 53, publishedPort: 5353, protocol: "tcp" },
			{ targetPort: 53, publishedPort: 5354, protocol: "udp" },
		]);

		expect(portBindings["53/tcp"]).toEqual([{ HostPort: "5353" }]);
		expect(portBindings["53/udp"]).toEqual([{ HostPort: "5354" }]);
	});

	it("appends to bindings that already exist instead of overwriting them", () => {
		const exposedPorts: Record<string, {}> = {};
		const portBindings: Record<string, Array<{ HostPort: string }>> = {
			"80/tcp": [{ HostPort: "80" }],
		};

		applyAdditionalPortBindings(exposedPorts, portBindings, [
			{ targetPort: 80, publishedPort: 8085, protocol: "tcp" },
		]);

		expect(portBindings["80/tcp"]).toEqual([
			{ HostPort: "80" },
			{ HostPort: "8085" },
		]);
	});
});
