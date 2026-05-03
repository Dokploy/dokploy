import { patchDnsRecord } from "@dokploy/server/services/cloudflare";
import {
	_ingressTargetForHost,
	_tunnelHostName,
	LOCAL_TUNNEL_NOT_CONFIGURED,
} from "@dokploy/server/services/cloudflare/orchestrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "cf-test-token";
const ZONE = "zone-abc";

const okResponse = (result: unknown, init?: { status?: number }) =>
	new Response(
		JSON.stringify({ success: true, errors: [], messages: [], result }),
		{
			status: init?.status ?? 200,
			headers: { "Content-Type": "application/json" },
		},
	);

describe("LOCAL_TUNNEL_NOT_CONFIGURED", () => {
	it("is the stable typed-error message used by the orchestrator", () => {
		expect(LOCAL_TUNNEL_NOT_CONFIGURED).toBe("LOCAL_TUNNEL_NOT_CONFIGURED");
	});
});

describe("ingress target per tunnel host kind", () => {
	it("remote servers route to localhost (cloudflared on host networking)", () => {
		const target = _ingressTargetForHost({
			kind: "remote",
			server: {
				serverId: "s1",
				name: "prod-1",
				organizationId: "org-1",
				tunnelId: "t1",
				tunnelAccountId: "acc-1",
				tunnelToken: null,
				tunnelStatus: "healthy",
			} as never,
		});
		expect(target).toBe("http://localhost:80");
	});

	it("local panel host routes to dokploy-traefik service name (container DNS)", () => {
		const target = _ingressTargetForHost({
			kind: "local",
			localServer: {
				localServerId: "l1",
				organizationId: "org-1",
				tunnelStatus: "healthy",
				tunnelId: "t1",
				tunnelToken: "tok",
				tunnelAccountId: "acc-1",
				tunnelError: null,
				tunnelCheckedAt: null,
				createdAt: "2026-05-03",
			},
			organizationId: "org-1",
		});
		expect(target).toBe("http://dokploy-traefik:80");
	});

	it("names the local host 'Dokploy Server' for error messages", () => {
		const name = _tunnelHostName({
			kind: "local",
			localServer: {
				localServerId: "l1",
				organizationId: "org-1",
				tunnelStatus: "healthy",
				tunnelId: "t1",
				tunnelToken: "tok",
				tunnelAccountId: "acc-1",
				tunnelError: null,
				tunnelCheckedAt: null,
				createdAt: "2026-05-03",
			},
			organizationId: "org-1",
		});
		expect(name).toBe("Dokploy Server");
	});
});

describe("patchDnsRecord", () => {
	let fetchMock: ReturnType<typeof vi.fn>;
	const realFetch = globalThis.fetch;

	beforeEach(() => {
		fetchMock = vi.fn();
		globalThis.fetch = fetchMock as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	it("PATCHes only the supplied fields and returns the updated record", async () => {
		const updated = {
			id: "rec-1",
			type: "CNAME",
			name: "reg.example.com",
			content: "new-tunnel.cfargotunnel.com",
			proxied: true,
			ttl: 1,
			comment: "Managed by Dokploy",
		};
		fetchMock.mockResolvedValueOnce(okResponse(updated));

		const result = await patchDnsRecord(TOKEN, ZONE, "rec-1", {
			content: "new-tunnel.cfargotunnel.com",
			type: "CNAME",
			proxied: true,
			comment: "Managed by Dokploy",
		});

		expect(result).toEqual(updated);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toContain(`/zones/${ZONE}/dns_records/rec-1`);
		expect(init.method).toBe("PATCH");
		expect(JSON.parse(init.body as string)).toEqual({
			content: "new-tunnel.cfargotunnel.com",
			type: "CNAME",
			proxied: true,
			comment: "Managed by Dokploy",
		});
	});

	it("does not include fields that weren't provided", async () => {
		fetchMock.mockResolvedValueOnce(
			okResponse({
				id: "rec-1",
				type: "CNAME",
				name: "x.example.com",
				content: "abc.cfargotunnel.com",
				proxied: true,
				ttl: 1,
			}),
		);
		await patchDnsRecord(TOKEN, ZONE, "rec-1", {
			content: "abc.cfargotunnel.com",
		});
		const [, init] = fetchMock.mock.calls[0]!;
		expect(JSON.parse(init.body as string)).toEqual({
			content: "abc.cfargotunnel.com",
		});
	});
});
