// Parse OCI image references into name / tag / digest, and build digest-pinned
// refs. Splitting rules mirror the existing webhook parser (last ':' may be a
// registry port, not a tag) and additionally understand '@sha256:' digests.

export function extractImageName(dockerImage: string | null): string | null {
	if (!dockerImage || typeof dockerImage !== "string") {
		return null;
	}
	// A digest ref splits on '@' — everything before '@' is the name (+ optional tag).
	const atIndex = dockerImage.indexOf("@");
	const ref = atIndex === -1 ? dockerImage : dockerImage.slice(0, atIndex);

	const lastColonIndex = ref.lastIndexOf(":");
	if (lastColonIndex === -1) {
		return ref;
	}
	const afterColon = ref.slice(lastColonIndex + 1);
	// A pure-numeric (or numeric+path) segment after ':' is a registry port, not a tag.
	if (/^\d{1,5}$/.test(afterColon) || /^\d{1,5}\//.test(afterColon)) {
		return ref;
	}
	return ref.slice(0, lastColonIndex);
}

export function extractImageTag(dockerImage: string | null): string | null {
	if (!dockerImage || typeof dockerImage !== "string") {
		return null;
	}
	const atIndex = dockerImage.indexOf("@");
	const ref = atIndex === -1 ? dockerImage : dockerImage.slice(0, atIndex);

	const lastColonIndex = ref.lastIndexOf(":");
	if (lastColonIndex === -1) {
		return "latest";
	}
	const afterColon = ref.slice(lastColonIndex + 1);
	// A registry port always has a path component after it (digits followed by '/').
	// Bare digits without a slash could be a valid numeric tag (e.g. "my-image:123").
	if (/^\d{1,5}\//.test(afterColon)) {
		return "latest";
	}
	return afterColon;
}

export function isDigestRef(ref: string): boolean {
	return ref.includes("@sha256:");
}

export function parseImageRef(ref: string): {
	name: string;
	tag: string | null;
	digest: string | null;
} {
	const atIndex = ref.indexOf("@");
	const digest = atIndex === -1 ? null : ref.slice(atIndex + 1);
	const beforeDigest = atIndex === -1 ? ref : ref.slice(0, atIndex);
	const name = extractImageName(beforeDigest) ?? beforeDigest;
	const tag =
		name === beforeDigest ? null : beforeDigest.slice(name.length + 1);
	return { name, tag: tag || null, digest };
}

export function normalizeRepo(name: string): string {
	const firstSlash = name.indexOf("/");
	const firstSegment = firstSlash === -1 ? name : name.slice(0, firstSlash);
	const hasRegistryHost =
		firstSlash !== -1 &&
		(firstSegment.includes(".") ||
			firstSegment.includes(":") ||
			firstSegment === "localhost");
	if (hasRegistryHost) {
		return name;
	}
	// Docker Hub shorthand
	if (firstSlash === -1) {
		return `docker.io/library/${name}`;
	}
	return `docker.io/${name}`;
}

export function buildPinnedRef(originalRef: string, digest: string): string {
	const name = extractImageName(originalRef) ?? originalRef;
	return `${name}@${digest}`;
}
