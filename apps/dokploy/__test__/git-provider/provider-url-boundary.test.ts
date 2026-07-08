import { assertGitProviderBaseUrlAllowed } from "@dokploy/server/utils/providers/url";
import { describe, expect, it } from "vitest";

describe("Git provider URL boundary", () => {
	it("rejects public-looking provider hostnames that resolve to private addresses", async () => {
		await expect(
			assertGitProviderBaseUrlAllowed("https://gitlab.example.com", {
				allowPrivateNetwork: false,
				fieldName: "GitLab provider URL",
				lookup: async () => [{ address: "10.0.0.10", family: 4 }],
			}),
		).rejects.toThrow(/GitLab provider URL/i);
	});

	it.each([
		["loopback", "127.0.0.1", 4],
		["link-local", "169.254.10.20", 4],
		["multicast", "224.0.0.1", 4],
		["documentation IPv4", "203.0.113.10", 4],
		["documentation IPv6", "2001:db8::1", 6],
	] as const)(
		"rejects public-looking provider hostnames that resolve to %s addresses",
		async (_label, address, family) => {
			await expect(
				assertGitProviderBaseUrlAllowed("https://git.example.com", {
					allowPrivateNetwork: false,
					fieldName: "Git provider URL",
					lookup: async () => [{ address, family }],
				}),
			).rejects.toThrow(/Git provider URL/i);
		},
	);

	it("rejects provider hostnames when any resolved address is blocked", async () => {
		await expect(
			assertGitProviderBaseUrlAllowed("https://git.example.com", {
				allowPrivateNetwork: false,
				fieldName: "Git provider URL",
				lookup: async () => [
					{ address: "8.8.8.8", family: 4 },
					{ address: "10.0.0.10", family: 4 },
				],
			}),
		).rejects.toThrow(/Git provider URL/i);
	});

	it("allows provider hostnames that resolve only to public addresses", async () => {
		await expect(
			assertGitProviderBaseUrlAllowed("https://gitea.example.com/base/", {
				allowPrivateNetwork: false,
				fieldName: "Gitea provider URL",
				lookup: async () => [{ address: "8.8.8.8", family: 4 }],
			}),
		).resolves.toBe("https://gitea.example.com/base");
	});

	it("rejects insecure cloud provider URLs before outbound API calls", async () => {
		await expect(
			assertGitProviderBaseUrlAllowed("http://gitlab.example.com", {
				allowPrivateNetwork: false,
				fieldName: "GitLab provider URL",
				lookup: async () => [{ address: "8.8.8.8", family: 4 }],
			}),
		).rejects.toThrow(/https/i);
	});

	it("preserves self-hosted private providers when private network calls are allowed", async () => {
		await expect(
			assertGitProviderBaseUrlAllowed("http://127.0.0.1:3000/", {
				allowPrivateNetwork: true,
				fieldName: "Gitea provider URL",
				lookup: async () => {
					throw new Error("lookup should not run");
				},
			}),
		).resolves.toBe("http://127.0.0.1:3000");
	});
});
