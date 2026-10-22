import { beforeEach, describe, expect, it, vi } from "vitest";

const releases = (versions: string[]) =>
	new Response(JSON.stringify(versions.map((tag_name) => ({ tag_name }))), {
		status: 200,
	});

describe("getRailpackVersions", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("loads up to 100 releases, normalizes tags, and caches the result", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(releases(["v0.39.0", "0.38.0"]));
		vi.stubGlobal("fetch", fetchMock);
		const { getRailpackVersions } = await import(
			"../../server/utils/railpack-versions"
		);

		expect(await getRailpackVersions()).toEqual(["0.39.0", "0.38.0"]);
		expect(await getRailpackVersions()).toEqual(["0.39.0", "0.38.0"]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toContain("per_page=100");
	});

	it("shares one request between simultaneous callers", async () => {
		let resolveResponse: ((response: Response) => void) | undefined;
		const fetchMock = vi.fn().mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					resolveResponse = resolve;
				}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { getRailpackVersions } = await import(
			"../../server/utils/railpack-versions"
		);

		const first = getRailpackVersions();
		const second = getRailpackVersions();
		resolveResponse?.(releases(["v0.39.0"]));
		expect(await Promise.all([first, second])).toEqual([
			["0.39.0"],
			["0.39.0"],
		]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("refreshes the cached list after 24 hours", async () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(releases(["v0.39.0"]))
			.mockResolvedValueOnce(releases(["v0.40.0"]));
		vi.stubGlobal("fetch", fetchMock);
		const { getRailpackVersions } = await import(
			"../../server/utils/railpack-versions"
		);

		expect(await getRailpackVersions()).toEqual(["0.39.0"]);
		now.mockReturnValue(1_000 + 24 * 60 * 60 * 1_000);
		expect(await getRailpackVersions()).toEqual(["0.40.0"]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("retries after a failed or empty response", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 403 }))
			.mockResolvedValueOnce(releases([]))
			.mockResolvedValueOnce(releases(["v0.39.0"]));
		vi.stubGlobal("fetch", fetchMock);
		const { getRailpackVersions } = await import(
			"../../server/utils/railpack-versions"
		);

		await expect(getRailpackVersions()).rejects.toThrow();
		await expect(getRailpackVersions()).rejects.toThrow();
		expect(await getRailpackVersions()).toEqual(["0.39.0"]);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});
