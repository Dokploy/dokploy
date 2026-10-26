const DOCKER_HUB_HOSTS = new Set([
	"docker.io",
	"index.docker.io",
	"registry-1.docker.io",
	"registry.hub.docker.com",
]);

/**
 * Reduce a configured registry URL to the host Docker uses for credential
 * lookup. Users may paste a URL with a scheme or a path, so strip both.
 */
export const getRegistryHost = (registryUrl?: string | null): string | null => {
	const raw = (registryUrl ?? "").trim();
	if (!raw) return null;

	const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
	const host = withoutScheme.split("/")[0]?.trim().toLowerCase();
	return host || null;
};

/**
 * Return the registry host encoded in an image reference, or null when the
 * reference has no host and therefore resolves to Docker Hub.
 *
 * Mirrors Docker's reference parsing: the first path component is a host when
 * it contains a dot or a port, is "localhost", or contains uppercase letters.
 */
export const getImageRegistryHost = (
	dockerImage?: string | null,
): string | null => {
	const ref = (dockerImage ?? "").trim();
	const slash = ref.indexOf("/");
	if (slash === -1) return null;

	const first = ref.slice(0, slash);
	const looksLikeHost =
		first.includes(".") ||
		first.includes(":") ||
		first.toLowerCase() === "localhost" ||
		first.toLowerCase() !== first;

	return looksLikeHost ? first.toLowerCase() : null;
};

const normalizeHost = (host: string): string =>
	DOCKER_HUB_HOSTS.has(host) ? "docker.io" : host;

/**
 * Whether pulling `dockerImage` uses the registry configured by
 * `registryUrl`.
 *
 * This decides if registry credentials may be sent to the registry at all.
 * Images from another registry, and bare Docker Hub images while a private
 * registry is configured, must not receive those credentials.
 */
export const isImageFromRegistry = (
	dockerImage?: string | null,
	registryUrl?: string | null,
): boolean => {
	const image = (dockerImage ?? "").trim();
	const registryHost = getRegistryHost(registryUrl);
	if (!image || !registryHost) return false;

	const imageHost = getImageRegistryHost(image);
	if (imageHost) {
		return normalizeHost(imageHost) === normalizeHost(registryHost);
	}

	// No host in the image means Docker resolves it against Docker Hub.
	return DOCKER_HUB_HOSTS.has(registryHost);
};
