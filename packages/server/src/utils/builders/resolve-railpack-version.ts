const LATEST_RELEASE_URL =
	"https://api.github.com/repos/railwayapp/railpack/releases/latest";
const LATEST_CACHE_TTL = 1000 * 60 * 60 * 24;

let latestCache: { version: string; fetchedAt: number } | undefined;
let pending: Promise<string> | undefined;

export const resolveRailpackVersion = async (version: string | null) => {
	if (version !== "latest") {
		return version;
	}
	if (latestCache && Date.now() - latestCache.fetchedAt < LATEST_CACHE_TTL) {
		return latestCache.version;
	}
	if (pending) {
		return pending;
	}

	const request = (async () => {
		const response = await fetch(LATEST_RELEASE_URL, {
			headers: {
				Accept: "application/vnd.github+json",
				...(process.env.GITHUB_TOKEN
					? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
					: {}),
			},
		});
		if (!response.ok) {
			throw new Error(
				"Failed to fetch the latest Railpack release from GitHub",
			);
		}

		const release = (await response.json()) as { tag_name?: unknown };
		const latestVersion =
			typeof release.tag_name === "string"
				? release.tag_name.replace(/^v/i, "")
				: "";
		if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(latestVersion)) {
			throw new Error("GitHub returned an invalid Railpack release version");
		}
		latestCache = { version: latestVersion, fetchedAt: Date.now() };
		return latestVersion;
	})();
	pending = request;
	try {
		return await request;
	} finally {
		if (pending === request) {
			pending = undefined;
		}
	}
};
