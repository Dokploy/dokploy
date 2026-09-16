/**
 * Helpers for reasoning about the two halves of a private-registry pull.
 *
 * Docker answers two independent questions from two independent inputs:
 *
 *   - "which registry do I fetch from?"  -> the image reference itself
 *   - "who am I when I ask?"             -> `docker login` / the auth config
 *
 * The Docker source type exposes both as separate fields (`dockerImage` and
 * `registryUrl`), and `registryUrl` is never prepended to the image: a bare
 * `app:latest` resolves to Docker Hub no matter what the Registry URL says.
 * These helpers make that rule explicit so the mismatch can be reported
 * instead of surfacing as a confusing "Login Succeeded" followed by
 * "pull access denied".
 */

const DOCKER_HUB_HOSTS = new Set([
	"docker.io",
	"index.docker.io",
	"registry-1.docker.io",
	"registry.hub.docker.com",
]);

/**
 * Reduce a configured Registry URL to the bare host[:port] Docker matches
 * credentials against, dropping any scheme and path: users routinely paste
 * `https://registry.example.com/namespace/`, which is not a registry host.
 */
export const normalizeRegistryHost = (registryUrl?: string | null): string => {
	const raw = (registryUrl ?? "").trim();
	if (!raw) return "";
	// Strip a scheme if present. The pattern requires "://" so a host:port
	// such as `registry.example.com:5000` is left alone.
	const withoutScheme = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
	return withoutScheme.split("/")[0] ?? "";
};

export const isDockerHubHost = (host: string): boolean =>
	DOCKER_HUB_HOSTS.has(host.toLowerCase());

/**
 * The value to hand to `docker login` / `AuthConfig.serveraddress`.
 *
 * Non-Hub URLs are reduced to their host, which is the key Docker stores and
 * looks credentials up under. Docker Hub is deliberately passed through
 * untouched: its canonical auth key is the legacy
 * `https://index.docker.io/v1/`, and rewriting that to a hostname would store
 * the credential under a key the Hub pull never looks up.
 */
export const registryAuthAddress = (registryUrl?: string | null): string => {
	const raw = (registryUrl ?? "").trim();
	if (!raw) return "";
	const host = normalizeRegistryHost(raw);
	if (!host || isDockerHubHost(host)) return raw;
	return host;
};

/**
 * The registry host carried by an image reference, or null when the reference
 * has none and therefore resolves to Docker Hub.
 *
 * Mirrors `splitDockerDomain` in distribution/reference: the first path
 * component is a registry host when it contains a `.` or `:`, is `localhost`,
 * or contains an uppercase character (registry paths are lowercase).
 */
export const getImageRegistryHost = (dockerImage: string): string | null => {
	const ref = dockerImage.trim();
	const slash = ref.indexOf("/");
	if (slash === -1) return null;
	const first = ref.slice(0, slash);
	const looksLikeHost =
		first.includes(".") ||
		first.includes(":") ||
		first === "localhost" ||
		first.toLowerCase() !== first;
	return looksLikeHost ? first : null;
};

/** How Docker will resolve a reference that carries no registry host. */
export const describeDockerHubResolution = (dockerImage: string): string => {
	const ref = dockerImage.trim();
	return ref.includes("/") ? `docker.io/${ref}` : `docker.io/library/${ref}`;
};

/**
 * Returns an actionable error when a Registry URL is configured but the image
 * would still be pulled from Docker Hub, or null when the pair is coherent.
 *
 * Deliberately conservative: it never rewrites the image. Prefixing
 * automatically would break the legitimate "authenticate to a private
 * registry, pull a public Hub image" setup, so the mismatch is reported and
 * the correction is left to the user.
 */
export const findRegistryMismatch = (
	dockerImage: string,
	registryUrl?: string | null,
): string | null => {
	const host = normalizeRegistryHost(registryUrl);
	if (!host || isDockerHubHost(host)) return null;
	if (getImageRegistryHost(dockerImage)) return null;

	const image = dockerImage.trim();
	return [
		`❌ Docker image "${image}" has no registry host, so Docker resolves it to ${describeDockerHubResolution(image)} — not to ${host}.`,
		"",
		'The Registry URL is only used for "docker login"; it is never added to the image name.',
		"Put the registry in the Docker Image field instead:",
		"",
		`  Docker Image:  ${host}/${image}`,
		`  Registry URL:  ${host}`,
		"",
		"(add your namespace/project between the host and the image if your registry uses one)",
	].join("\n");
};
