import { apiCreateBackup, apiUpdateBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import { getS3Credentials } from "@dokploy/server/utils/backups/utils";
import { describe, expect, it } from "vitest";

const destination: Destination = {
	destinationId: "destination-id",
	name: "S3",
	provider: "AWS",
	accessKey: "access-key",
	secretAccessKey: "secret-access-key",
	bucket: "bucket",
	region: "us-east-1",
	endpoint: "https://s3.us-east-1.amazonaws.com",
	organizationId: "org-id",
	createdAt: new Date(),
};

describe("backup schema storage class field", () => {
	it("allows create payload without storage class", () => {
		const parsed = apiCreateBackup.safeParse({
			schedule: "0 0 * * *",
			enabled: true,
			prefix: "/",
			destinationId: "destination-id",
			keepLatestCount: 5,
			database: "dokploy",
			databaseType: "web-server",
			backupType: "database",
			userId: "user-id",
		});

		expect(parsed.success).toBe(true);
	});

	it("allows update payload without storage class", () => {
		const parsed = apiUpdateBackup.safeParse({
			backupId: "backup-id",
			schedule: "0 0 * * *",
			enabled: true,
			prefix: "/",
			destinationId: "destination-id",
			database: "dokploy",
			keepLatestCount: undefined,
			serviceName: null,
			metadata: undefined,
			databaseType: "web-server",
		});

		expect(parsed.success).toBe(true);
	});

	it("allows update payload with null storage class for reset", () => {
		const parsed = apiUpdateBackup.safeParse({
			backupId: "backup-id",
			schedule: "0 0 * * *",
			enabled: true,
			prefix: "/",
			destinationId: "destination-id",
			database: "dokploy",
			databaseType: "web-server",
			storageClass: null,
		});

		expect(parsed.success).toBe(true);
	});
});

describe("getS3Credentials backup storage class override", () => {
	it("adds storage class flag when override is valid", () => {
		const flags = getS3Credentials(destination, "GLACIER");
		expect(flags).toContain('--s3-storage-class="GLACIER"');
	});

	it("does not add storage class flag when override is invalid", () => {
		const flags = getS3Credentials(destination, "INVALID");
		expect(flags.some((flag) => flag.includes("--s3-storage-class"))).toBe(
			false,
		);
	});

	it("does not add storage class flag when override is whitespace", () => {
		const flags = getS3Credentials(destination, "   ");
		expect(flags.some((flag) => flag.includes("--s3-storage-class"))).toBe(
			false,
		);
	});
});
