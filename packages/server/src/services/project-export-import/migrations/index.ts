import type { Manifest } from "../types";
import { TRANSFER_FORMAT_VERSION } from "../types";

export class UnsupportedBundleVersionError extends Error {
	constructor(bundleVersion: number, supportedVersion: number) {
		super(
			`This bundle was created by a newer version of Dokploy (format v${bundleVersion}) and cannot be imported by this installation, which supports up to v${supportedVersion}. Upgrade Dokploy before importing this bundle.`,
		);
		this.name = "UnsupportedBundleVersionError";
	}
}

export const migrateManifest = (manifest: Manifest): Manifest => {
	if (manifest.formatVersion > TRANSFER_FORMAT_VERSION) {
		throw new UnsupportedBundleVersionError(
			manifest.formatVersion,
			TRANSFER_FORMAT_VERSION,
		);
	}
	return manifest;
};
