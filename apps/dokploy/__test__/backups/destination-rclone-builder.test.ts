import { getDestinationRemote } from "@dokploy/server/utils/backups/utils";
import { describe, expect, it } from "vitest";

describe("getDestinationRemote", () => {
	describe("S3 destinations", () => {
		it("generates correct rclone flags and remote paths for AWS S3", () => {
			const destination = {
				destinationType: "s3" as const,
				name: "AWS S3 Production",
				provider: "AWS",
				accessKey: "AKIAIOSFODNN7EXAMPLE",
				secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				bucket: "my-production-backups",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				additionalFlags: ["--s3-upload-concurrency=4"],
			};

			const { rcloneFlags, remoteBase, getRemotePath } =
				getDestinationRemote(destination);

			expect(remoteBase).toBe(":s3:my-production-backups");
			expect(getRemotePath("mydb/dump.sql.gz")).toBe(
				":s3:my-production-backups/mydb/dump.sql.gz",
			);
			expect(getRemotePath()).toBe(":s3:my-production-backups");

			const flagsStr = rcloneFlags.join(" ");
			expect(flagsStr).toContain("--s3-access-key-id=AKIAIOSFODNN7EXAMPLE");
			expect(flagsStr).toContain(
				"--s3-secret-access-key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			);
			expect(flagsStr).toContain("--s3-region=us-east-1");
			expect(flagsStr).toContain("--s3-endpoint=");
			expect(flagsStr).toContain("--s3-provider=AWS");
			expect(flagsStr).toContain("--s3-no-check-bucket");
			expect(flagsStr).toContain("--s3-force-path-style");
			expect(flagsStr).toContain("--s3-upload-concurrency=4");
		});

		it("defaults to s3 when destinationType is omitted (backward compatibility)", () => {
			const destination = {
				name: "Legacy Destination",
				provider: "Cloudflare",
				accessKey: "cf_key_123",
				secretAccessKey: "cf_secret_456",
				bucket: "cf-r2-backups",
				region: "auto",
				endpoint: "https://myaccount.r2.cloudflarestorage.com",
				additionalFlags: [],
			};

			const { rcloneFlags, remoteBase, getRemotePath } =
				getDestinationRemote(destination);

			expect(remoteBase).toBe(":s3:cf-r2-backups");
			expect(getRemotePath("path/to/file")).toBe(
				":s3:cf-r2-backups/path/to/file",
			);
			const flagsStr = rcloneFlags.join(" ");
			expect(flagsStr).toContain("--s3-access-key-id=cf_key_123");
			expect(flagsStr).toContain("--s3-provider=Cloudflare");
		});
	});

	describe("Azure Blob Storage destinations", () => {
		it("generates correct rclone flags for Account Name and Account Key authentication", () => {
			const destination = {
				destinationType: "azure_blob" as const,
				name: "Azure Production Blob",
				provider: "account_key",
				accessKey: "myazureaccount",
				secretAccessKey: "dGhpcyBpcyBhIHZhbGlkIGJhc2U2NCBrZXk=",
				bucket: "dokploy-backup-container",
				region: "",
				endpoint: "",
				additionalFlags: ["--azureblob-access-tier=cool"],
			};

			const { rcloneFlags, remoteBase, getRemotePath } =
				getDestinationRemote(destination);

			expect(remoteBase).toBe(":azureblob:dokploy-backup-container");
			expect(getRemotePath("postgres/dump.sql.gz")).toBe(
				":azureblob:dokploy-backup-container/postgres/dump.sql.gz",
			);

			const flagsStr = rcloneFlags.join(" ");
			expect(flagsStr).toContain("--azureblob-account=myazureaccount");
			expect(flagsStr).toContain("--azureblob-key=");
			expect(flagsStr).toContain("--azureblob-access-tier=cool");
			expect(flagsStr).not.toContain("--azureblob-endpoint");
			expect(flagsStr).not.toContain("--s3-access-key-id");
		});

		it("generates correct rclone flags for SAS URL authentication", () => {
			const sasUrl =
				"https://myaccount.blob.core.windows.net/mycontainer?sp=racwdl&st=2026-09-08T00:00:00Z&se=2026-09-09T00:00:00Z&spr=https&sv=2022-11-02&sr=c&sig=testsignature";
			const destination = {
				destinationType: "azure_blob" as const,
				name: "Azure SAS Destination",
				provider: "sas_url",
				accessKey: "",
				secretAccessKey: sasUrl,
				bucket: "mycontainer",
				region: "",
				endpoint: "",
				additionalFlags: [],
			};

			const { rcloneFlags, remoteBase, getRemotePath } =
				getDestinationRemote(destination);

			expect(remoteBase).toBe(":azureblob:mycontainer");
			expect(getRemotePath("volumes/app-data.tar")).toBe(
				":azureblob:mycontainer/volumes/app-data.tar",
			);

			const flagsStr = rcloneFlags.join(" ");
			expect(flagsStr).toContain("--azureblob-sas-url=");
			expect(flagsStr).not.toContain("--azureblob-account");
			expect(flagsStr).not.toContain("--azureblob-key");
		});

		it("handles custom endpoint for Azurite local emulator or sovereign clouds", () => {
			const destination = {
				destinationType: "azure_blob" as const,
				name: "Azurite Local Emulator",
				provider: "account_key",
				accessKey: "devstoreaccount1",
				secretAccessKey:
					"Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
				bucket: "local-container",
				region: "",
				endpoint: "http://127.0.0.1:10000/devstoreaccount1",
				additionalFlags: [],
			};

			const { rcloneFlags, remoteBase } = getDestinationRemote(destination);

			expect(remoteBase).toBe(":azureblob:local-container");
			const flagsStr = rcloneFlags.join(" ");
			expect(flagsStr).toContain("--azureblob-account=devstoreaccount1");
			expect(flagsStr).toContain("--azureblob-endpoint=");
		});

		it("accepts az_bs alias for destinationType", () => {
			const destination = {
				destinationType: "az_bs" as const,
				name: "AZ_BS Destination",
				provider: "account_key",
				accessKey: "myaccount",
				secretAccessKey: "secretkey123",
				bucket: "test-container",
				region: "",
				endpoint: "",
				additionalFlags: [],
			};

			const { remoteBase } = getDestinationRemote(destination);
			expect(remoteBase).toBe(":azureblob:test-container");
		});
	});
});
