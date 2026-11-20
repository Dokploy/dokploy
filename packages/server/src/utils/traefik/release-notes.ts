export const getTraefikReleaseNotesUrl = (version: string) => {
	const tag = /^v?(\d+\.\d+\.\d+)$/.exec(version)?.[1];
	return tag ? `https://github.com/traefik/traefik/releases/tag/v${tag}` : null;
};
