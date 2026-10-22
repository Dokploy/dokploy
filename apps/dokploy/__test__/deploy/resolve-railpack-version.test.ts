import { beforeEach, describe, expect, it, vi } from "vitest";

const release = (tag_name: string) =>
	new Response(JSON.stringify({ tag_name }), { status: 200 });

describe("resolveRailpackVersion", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("keeps a pinned version without contacting GitHub", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { resolveRailpackVersion } = await import(
			"../../../../packages/server/src/utils/builders/resolve-railpack-version"
		);

		expect(await resolveRailpackVersion("0.38.0")).toBe("0.38.0");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("resolves latest for simultaneous builds and refreshes after five minutes", async () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(release("v0.40.1"))
			.mockResolvedValueOnce(release("v0.41.0"));
		vi.stubGlobal("fetch", fetchMock);
		const { resolveRailpackVersion } = await import(
			"../../../../packages/server/src/utils/builders/resolve-railpack-version"
		);

		expect(
			await Promise.all([
				resolveRailpackVersion("latest"),
				resolveRailpackVersion("latest"),
			]),
		).toEqual(["0.40.1", "0.40.1"]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toContain("/releases/latest");

		now.mockReturnValue(1_000 + 5 * 60 * 1_000);
		expect(await resolveRailpackVersion("latest")).toBe("0.41.0");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("rejects failed or invalid responses and allows retry", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 403 }))
			.mockResolvedValueOnce(release("vlatest;exit"))
			.mockResolvedValueOnce(release("v0.40.1"));
		vi.stubGlobal("fetch", fetchMock);
		const { resolveRailpackVersion } = await import(
			"../../../../packages/server/src/utils/builders/resolve-railpack-version"
		);

		await expect(resolveRailpackVersion("latest")).rejects.toThrow();
		await expect(resolveRailpackVersion("latest")).rejects.toThrow();
		expect(await resolveRailpackVersion("latest")).toBe("0.40.1");
	});
});
