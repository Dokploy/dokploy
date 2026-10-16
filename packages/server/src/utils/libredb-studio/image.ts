import semver from "semver";
import { LIBREDB_STUDIO_MIN_VERSION } from "./constants";

// Studio publishes <version>, <version>-alpine and <version>-alpine-slim, so
// only those suffixes are variants; any other suffix is a semver prerelease.
const IMAGE_VARIANT = /-alpine(?:-slim)?$/;
// Leading zeros are refused so the captured version is always valid semver.
const RELEASE_TAG =
	/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;

const splitImageReference = (image: string | null | undefined) => {
	const reference = image?.trim();
	// A digest pins the content, so a tag written next to it proves nothing.
	if (!reference || reference.includes("@")) {
		return null;
	}
	const lastSlash = reference.lastIndexOf("/");
	const lastColon = reference.lastIndexOf(":");
	// A colon before the last slash is a registry port, not a tag separator.
	if (lastColon <= lastSlash) {
		return null;
	}
	const version = reference.slice(lastColon + 1).replace(IMAGE_VARIANT, "");
	if (!RELEASE_TAG.test(version)) {
		return null;
	}
	return { repository: reference.slice(0, lastColon), version };
};

export const parseStudioImageVersion = (
	image: string | null | undefined,
): string | null => splitImageReference(image)?.version ?? null;

export const isBelowMinimumStudioVersion = (
	image: string | null | undefined,
): boolean => {
	const version = parseStudioImageVersion(image);
	return version !== null && semver.lt(version, LIBREDB_STUDIO_MIN_VERSION);
};

// Only an older release of the recommended repository counts, so the card's
// one-click update never downgrades a newer or custom image.
export const isStudioImageUpdateAvailable = (
	image: string | null | undefined,
	recommendedImage: string,
): boolean => {
	const current = splitImageReference(image);
	const recommended = splitImageReference(recommendedImage);
	return (
		current !== null &&
		recommended !== null &&
		current.repository === recommended.repository &&
		semver.lt(current.version, recommended.version)
	);
};
