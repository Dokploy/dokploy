import { parseGithubBaseUrl } from "@dokploy/server/utils/providers/github";
import { describe, expect, it } from "vitest";
import { DEFAULT_GITHUB_URL, resolveGithubBaseUrl } from "@/utils/github-utils";

/**
 * The client cannot import from @dokploy/server (node-only modules), so
 * resolveGithubBaseUrl duplicates parseGithubBaseUrl. Nothing but this file
 * stops the two from drifting apart — and they already did once, when the
 * client stripped trailing slashes but not paths and the form action disagreed
 * with the persisted row.
 *
 * The invariant: for the same input, both must make the same accept/reject
 * decision, and agree on the URL when they accept.
 */
const INPUTS = [
	// Accepted
	"https://github.com",
	"github.com",
	"https://acme.ghe.com",
	"acme.ghe.com",
	"https://github.corp.acme.com",
	"https://github.acme.com:8443",
	"https://acme.ghe.com/",
	"https://acme.ghe.com///",
	"https://acme.ghe.com/enterprises/foo",
	"https://acme.ghe.com/some/path?x=1",
	"  acme.ghe.com  ",
	"https://acme.ghe.com.",
	"https://169.254.169.254",
	"https://127.0.0.1",
	"https://2130706433",
	"https://0x7f.1",
	"",
	"   ",
	// Rejected
	"http://acme.ghe.com",
	"http://localhost:2375",
	"https://[::1]",
	"https://[::ffff:127.0.0.1]",
	"https://metadata",
	"https://metadata.",
	"https://localhost",
	"https://localhost.",
	"htps://acme.ghe.com",
	"ftp://acme.ghe.com",
	"https://",
	"acme .ghe.com",
	"esto no es una url",
];

describe("client and server agree on GitHub base URLs", () => {
	it.each(INPUTS)("%j", (input) => {
		const client = resolveGithubBaseUrl(input);
		const server = parseGithubBaseUrl(input);

		const clientAccepted = !client.error;
		const serverAccepted = "url" in server;

		expect(
			clientAccepted,
			`accept/reject differs for ${JSON.stringify(input)}`,
		).toBe(serverAccepted);

		if (clientAccepted && "url" in server) {
			expect(client.baseUrl, `resolved URL differs for ${input}`).toBe(
				server.url,
			);
		}
	});

	it("both treat an empty value as github.com", () => {
		expect(resolveGithubBaseUrl("").baseUrl).toBe(DEFAULT_GITHUB_URL);
		expect(parseGithubBaseUrl("")).toEqual({ url: DEFAULT_GITHUB_URL });
	});
});
