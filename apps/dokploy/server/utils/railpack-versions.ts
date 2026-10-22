const CACHE_TTL = 1000 * 60 * 60 * 24;
const RELEASES_URL =
	"https://api.github.com/repos/railwayapp/railpack/releases?per_page=100";

let cache: { versions: string[]; fetchedAt: number } | undefined;
let pending: Promise<string[]> | undefined;

export async function getRailpackVersions(): Promise<string[]> {
	if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
		return cache.versions;
	}
	if (pending) {
		return pending;
	}

	const request = (async () => {
		const response = await fetch(RELEASES_URL, {
			headers: {
				Accept: "application/vnd.github+json",
				...(process.env.GITHUB_TOKEN
					? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
					: {}),
			},
		});
		if (!response.ok) {
			throw new Error("Failed to fetch Railpack versions from GitHub");
		}

		const releases = (await response.json()) as Array<{ tag_name: string }>;
		const versions = releases.map((release) =>
			release.tag_name.replace(/^v/i, ""),
		);
		if (versions.length === 0) {
			throw new Error("GitHub returned no Railpack versions");
		}
		cache = { versions, fetchedAt: Date.now() };
		return versions;
	})();
	pending = request;
	try {
		return await request;
	} finally {
		if (pending === request) {
			pending = undefined;
		}
	}
}
