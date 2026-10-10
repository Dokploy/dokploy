import type { Destination } from "@dokploy/server/services/destination";
import {
	getRcloneConfig,
	getRcloneDestinationPath,
	getRcloneProviderPrefix,
} from "@dokploy/server/utils/backups/utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return { ...actual, execFileSync: () => "OBSCURED_PASSWORD\n" };
});

const destination = (provider: string, overrides: Partial<Destination> = {}) =>
	({
		destinationId: "d1",
		name: "test",
		provider,
		accessKey: "user-or-client",
		secretAccessKey: "secret",
		bucket: "backups/path",
		region: "",
		endpoint: "",
		additionalFlags: [],
		organizationId: "org",
		createdAt: new Date(),
		...overrides,
	}) as Destination;

describe("multi destination rclone mapping", () => {
	it("preserves existing S3 provider values and flags", () => {
		const d = destination("Cloudflare", {
			region: "auto",
			endpoint: "https://r2.example.test",
		});
		expect(getRcloneProviderPrefix(d.provider)).toBe("s3");
		expect(getRcloneDestinationPath(d, "probe.sql.gz")).toBe(
			":s3:backups/path/probe.sql.gz",
		);
		const flags = getRcloneConfig(d).join(" ");
		expect(flags).toContain("--s3-provider=Cloudflare");
		expect(flags).toContain("--s3-access-key-id=user-or-client");
		expect(flags).toContain("--s3-secret-access-key=secret");
	});

	it("maps FTP connection values from existing destination columns", () => {
		const d = destination("ftp", {
			endpoint: "ftp.example.test",
			region: "2121",
		});
		expect(getRcloneProviderPrefix(d.provider)).toBe("ftp");
		const flags = getRcloneConfig(d).join(" ");
		expect(flags).toContain("--ftp-host=ftp.example.test");
		expect(flags).toContain("--ftp-port=2121");
		expect(flags).toContain("--ftp-user=user-or-client");
		expect(flags).toContain("--ftp-pass=OBSCURED_PASSWORD");
	});

	it("maps SFTP and preserves custom flags", () => {
		const d = destination("sftp", {
			endpoint: "sftp.example.test",
			region: "2222",
			additionalFlags: ["--sftp-use-fips-mode=false"],
		});
		const flags = getRcloneConfig(d);
		expect(getRcloneProviderPrefix(d.provider)).toBe("sftp");
		expect(flags.join(" ")).toContain("--sftp-host=sftp.example.test");
		expect(flags.join(" ")).toContain("--sftp-port=2222");
		expect(flags).toContain("--sftp-use-fips-mode=false");
		expect(flags.join(" ")).toContain("--sftp-pass=OBSCURED_PASSWORD");
	});

	it("maps Google Drive OAuth settings without changing S3 semantics", () => {
		const d = destination("google-drive", {
			accessKey: "google-client-id",
			secretAccessKey: JSON.stringify({
				clientSecret: "google-client-secret",
				token: '{"access_token":"google-token","refresh_token":"refresh"}',
			}),
			bucket: "dokploy-backups",
			endpoint: "root-folder-id",
		});
		expect(getRcloneProviderPrefix(d.provider)).toBe("drive");
		expect(getRcloneDestinationPath(d, "db.sql.gz")).toBe(
			":drive:dokploy-backups/db.sql.gz",
		);
		const flags = getRcloneConfig(d).join(" ");
		expect(flags).toContain("--drive-client-id=google-client-id");
		expect(flags).toContain("--drive-client-secret=google-client-secret");
		expect(flags).toContain("--drive-token=");
		expect(flags).toContain("--drive-root-folder-id=root-folder-id");
		expect(flags).not.toContain("--s3-provider");
	});

	it("maps OneDrive OAuth token, drive id and drive type", () => {
		const d = destination("onedrive", {
			accessKey: "microsoft-client-id",
			secretAccessKey: JSON.stringify({
				clientSecret: "microsoft-client-secret",
				token: '{"access_token":"ms-token","refresh_token":"refresh"}',
			}),
			bucket: "dokploy-backups",
			endpoint: "drive-id-123",
			region: "business",
		});
		expect(getRcloneProviderPrefix(d.provider)).toBe("onedrive");
		expect(getRcloneDestinationPath(d, "db.sql.gz")).toBe(
			":onedrive:dokploy-backups/db.sql.gz",
		);
		const flags = getRcloneConfig(d).join(" ");
		expect(flags).toContain("--onedrive-client-id=microsoft-client-id");
		expect(flags).toContain("--onedrive-client-secret=microsoft-client-secret");
		expect(flags).toContain("--onedrive-token=");
		expect(flags).toContain("--onedrive-drive-id=drive-id-123");
		expect(flags).toContain("--onedrive-drive-type=business");
		expect(flags).not.toContain("--s3-provider");
	});

	it("rejects malformed cloud OAuth bundles instead of falling back to S3", () => {
		const d = destination("google-drive", { secretAccessKey: "not-json" });
		expect(() => getRcloneConfig(d)).toThrow(
			/Cloud destination credentials are invalid/,
		);
	});
});
