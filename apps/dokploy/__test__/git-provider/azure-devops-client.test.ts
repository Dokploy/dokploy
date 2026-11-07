import {
	AzureDevopsClient,
	normalizeAzureDevopsUrl,
} from "@dokploy/server/utils/providers/azure-devops-client";
import { afterEach, describe, expect, it, vi } from "vitest";

const token = "test-private-pat";
const json = (value: unknown, headers?: Record<string, string>) =>
	new Response(JSON.stringify(value), {
		headers: { "content-type": "application/json", ...headers },
	});
afterEach(() => vi.useRealTimers());

describe("Azure DevOps collection URLs and authentication", () => {
	it.each([
		"https://dev.azure.com/contoso",
		"https://contoso.visualstudio.com",
		"https://ado.example.com:8443/tfs/DefaultCollection",
		"https://ado.example.com/DefaultCollection",
		"https://ado.example.com/tfs/Team%20Collection",
	])("preserves %s and paginates projects", async (base) => {
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				json(
					{ value: [{ id: "1", name: "One" }] },
					{ "x-ms-continuationtoken": "next/+" },
				),
			)
			.mockResolvedValueOnce(json({ value: [{ id: "2", name: "Two" }] }));
		const client = new AzureDevopsClient(`${base}/`, token, request);
		expect(await client.projects()).toHaveLength(2);
		const url = new URL(String(request.mock.calls[1]?.[0]));
		expect(url.href).toContain(`${base}/_apis/projects`);
		expect(url.searchParams.get("continuationToken")).toBe("next/+");
		expect(url.searchParams.get("api-version")).toBe("7.0");
		expect(request.mock.calls[0]?.[1]).toMatchObject({
			redirect: "manual",
			headers: {
				Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
			},
		});
		expect(url.href).not.toContain(token);
	});
	it.each([
		"http://ado.test/collection",
		"https://user:secret@ado.test/collection",
		"https://ado.test",
		"https://dev.azure.com",
		"https://visualstudio.com",
		"https://contoso.visualstudio.com.evil.test",
		"https://other.contoso.visualstudio.com",
		"https://ado.test/c?token=x",
		"https://ado.test/c#x",
		"https://ado.test/c%2fother",
		"https://ado.test/c\\evil",
	])("rejects unsafe URL %s", (value) =>
		expect(() => normalizeAzureDevopsUrl(value)).toThrow("HTTPS"),
	);
	it.each([401, 403, 404, 500, 302])(
		"sanitizes HTTP %s without exposing headers or bodies",
		async (status) => {
			const request = vi.fn<typeof fetch>().mockResolvedValue(
				new Response(`secret ${token}`, {
					status,
					headers: { location: "https://login.test" },
				}),
			);
			const client = new AzureDevopsClient(
				"https://ado.test/c",
				token,
				request,
			);
			const error = await client.projects().catch((error) => error);
			expect(error.status).toBe(status);
			expect(JSON.stringify(error)).not.toContain(token);
			expect(String(error)).not.toContain(token);
			expect(request).toHaveBeenCalledTimes(1);
		},
	);
	it("rejects an HTML login page returned with HTTP 200", async () => {
		const client = new AzureDevopsClient(
			"https://ado.test/c",
			token,
			vi.fn<typeof fetch>().mockResolvedValue(
				new Response("<html>Login</html>", {
					headers: { "content-type": "text/html" },
				}),
			),
		);
		await expect(client.projects()).rejects.toThrow("non-JSON");
	});
	it("sanitizes invalid JSON and TLS failures", async () => {
		for (const request of [
			vi.fn<typeof fetch>().mockResolvedValue(
				new Response(`{${token}`, {
					headers: { "content-type": "application/json" },
				}),
			),
			vi.fn<typeof fetch>().mockRejectedValue(new Error(`TLS ${token}`)),
		]) {
			await expect(
				new AzureDevopsClient("https://ado.test/c", token, request).projects(),
			).rejects.not.toThrow(token);
		}
	});
	it("times out without exposing the request", async () => {
		vi.useFakeTimers();
		const request = vi
			.fn<typeof fetch>()
			.mockImplementation(
				(_url, options) =>
					new Promise((_resolve, reject) =>
						options?.signal?.addEventListener("abort", () =>
							reject(new Error(token)),
						),
					),
			);
		const result = new AzureDevopsClient(
			"https://ado.test/c",
			token,
			request,
		).projects();
		const assertion = expect(result).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(20_000);
		await assertion;
	});
	it("paginates refs and encodes path segments", async () => {
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				json(
					{ value: [{ name: "refs/heads/a" }] },
					{ "x-ms-continuationtoken": "2" },
				),
			)
			.mockResolvedValueOnce(json({ value: [{ name: "refs/heads/b" }] }));
		expect(
			await new AzureDevopsClient(
				"https://ado.test/tfs/c",
				token,
				request,
			).branches("team/name", "repo id"),
		).toHaveLength(2);
		expect(String(request.mock.calls[0]?.[0])).toContain(
			"/team%2Fname/_apis/git/repositories/repo%20id/refs?",
		);
	});
	it("rejects repeated continuation tokens", async () => {
		const request = vi
			.fn<typeof fetch>()
			.mockImplementation(async () =>
				json({ value: [] }, { "x-ms-continuationtoken": "same" }),
			);
		await expect(
			new AzureDevopsClient("https://ado.test/c", token, request).projects(),
		).rejects.toThrow("pagination token");
	});
	it("does not use unsupported repository page/limit parameters", async () => {
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValue(json({ value: [] }));
		expect(
			await new AzureDevopsClient(
				"https://ado.test/c",
				token,
				request,
			).repositories("project"),
		).toEqual([]);
		expect(String(request.mock.calls[0]?.[0])).toBe(
			"https://ado.test/c/project/_apis/git/repositories?api-version=7.0",
		);
	});
	it("paginates diffs and includes old and new rename paths", async () => {
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				json({
					commonCommit: "abc",
					allChangesIncluded: false,
					changes: [
						{ item: { path: "/new/name" }, sourceServerItem: "/old/name" },
					],
				}),
			)
			.mockResolvedValueOnce(
				json({
					commonCommit: "abc",
					allChangesIncluded: true,
					changes: [{ item: { path: "/deleted" } }],
				}),
			);
		const paths = await new AzureDevopsClient(
			"https://ado.test/c",
			token,
			request,
		).changedPaths("project", "repo", "before", "after");
		expect(paths).toEqual(["new/name", "old/name", "deleted"]);
		expect(
			new URL(String(request.mock.calls[1]?.[0])).searchParams.get("$skip"),
		).toBe("1");
	});
	it.each([
		"https://evil.test/c/r",
		"https://ado.test/another/r",
		"https://ado.test/collection-evil/r",
		"https://ado.test/collection/../evil",
		"https://u:secret@ado.test/collection/r",
		"http://ado.test/collection/r",
	])("rejects out-of-scope clone URL %s", (url) =>
		expect(() =>
			new AzureDevopsClient("https://ado.test/collection", token).cloneUrl(url),
		).toThrow("outside"),
	);
	it("removes Azure Services organization username from clone URLs", () =>
		expect(
			new AzureDevopsClient("https://dev.azure.com/contoso", token).cloneUrl(
				"https://contoso@dev.azure.com/contoso/project/_git/repo",
			),
		).toBe("https://dev.azure.com/contoso/project/_git/repo"));
	it.each([
		"https://contoso.visualstudio.com/project/_git/repo",
		"https://contoso.visualstudio.com/DefaultCollection/project/_git/repo",
	])("accepts same-organization legacy Services clone URL %s", (url) => {
		const client = new AzureDevopsClient(
			"https://contoso.visualstudio.com/",
			token,
		);
		expect(client.baseUrl).toBe("https://contoso.visualstudio.com");
		expect(client.cloneUrl(url)).toBe(url);
	});
	it.each([
		"https://other.visualstudio.com/project/_git/repo",
		"https://contoso.visualstudio.com.evil.test/project/_git/repo",
		"https://contoso.visualstudio.com:8443/project/_git/repo",
		"https://user:secret@contoso.visualstudio.com/project/_git/repo",
	])("rejects legacy Services clone URL outside its organization %s", (url) => {
		const client = new AzureDevopsClient(
			"https://contoso.visualstudio.com",
			token,
		);
		expect(() => client.cloneUrl(url)).toThrow("outside");
	});
});
