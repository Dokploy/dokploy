import {
	apiCreateDestination,
	apiUpdateDestination,
	azureBlobDestinationSchema,
	s3DestinationSchema,
} from "@dokploy/server/db/schema/destination";
import { describe, expect, it } from "vitest";

describe("Destination Zod Schema Validation", () => {
	describe("S3 Destination Validation", () => {
		it("validates valid S3 destination input", () => {
			const input = {
				destinationType: "s3" as const,
				name: "AWS S3 Prod",
				provider: "AWS",
				accessKey: "AKIA1234567890",
				secretAccessKey: "secret1234567890",
				bucket: "my-bucket",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
			};

			const result = s3DestinationSchema.safeParse(input);
			expect(result.success).toBe(true);
		});

		it("rejects S3 destination missing required fields", () => {
			const input = {
				destinationType: "s3" as const,
				name: "Incomplete S3",
				provider: "AWS",
				// missing accessKey, secretAccessKey, bucket, endpoint
			};

			const result = s3DestinationSchema.safeParse(input);
			expect(result.success).toBe(false);
		});
	});

	describe("Azure Blob Storage Validation", () => {
		it("validates Azure Blob with Account Key", () => {
			const input = {
				destinationType: "azure_blob" as const,
				name: "Azure Backup",
				provider: "account_key" as const,
				accessKey: "myazurestorageacc",
				secretAccessKey: "dGVzdGtleQ==",
				bucket: "mycontainer",
			};

			const result = azureBlobDestinationSchema.safeParse(input);
			expect(result.success).toBe(true);
		});

		it("rejects Azure Blob with Account Key if storage account name is missing", () => {
			const input = {
				destinationType: "azure_blob" as const,
				name: "Azure Backup",
				provider: "account_key" as const,
				accessKey: "", // missing storage account
				secretAccessKey: "dGVzdGtleQ==",
				bucket: "mycontainer",
			};

			const result = azureBlobDestinationSchema.safeParse(input);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]?.message).toContain(
					"Storage Account Name is required",
				);
			}
		});

		it("validates Azure Blob with SAS URL", () => {
			const input = {
				destinationType: "azure_blob" as const,
				name: "Azure Backup via SAS",
				provider: "sas_url" as const,
				secretAccessKey:
					"https://mystorage.blob.core.windows.net/mycontainer?sv=2022-11-02&sig=test",
				bucket: "mycontainer",
			};

			const result = azureBlobDestinationSchema.safeParse(input);
			expect(result.success).toBe(true);
		});
	});

	describe("apiCreateDestination & apiUpdateDestination Discriminated Union", () => {
		it("routes payload without destinationType to S3 (backward compatibility)", () => {
			const legacyInput = {
				name: "Legacy Destination",
				provider: "Minio",
				accessKey: "minioadmin",
				secretAccessKey: "miniopassword",
				bucket: "dokploy",
				region: "us-east-1",
				endpoint: "http://minio:9000",
			};

			const result = apiCreateDestination.safeParse(legacyInput);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.destinationType).toBe("s3");
			}
		});

		it("normalizes az_bs destinationType to azure_blob", () => {
			const azBsInput = {
				destinationType: "az_bs",
				name: "Azure Prompt Notation",
				provider: "account_key",
				accessKey: "myacc",
				secretAccessKey: "mysecretkey",
				bucket: "mycontainer",
			};

			const result = apiCreateDestination.safeParse(azBsInput);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.destinationType).toBe("azure_blob");
			}
		});

		it("validates apiUpdateDestination with destinationId", () => {
			const updateInput = {
				destinationId: "dest-12345",
				destinationType: "azure_blob",
				name: "Updated Azure Backup",
				provider: "account_key",
				accessKey: "myacc",
				secretAccessKey: "newsecretkey",
				bucket: "mycontainer",
			};

			const result = apiUpdateDestination.safeParse(updateInput);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.destinationId).toBe("dest-12345");
				expect(result.data.name).toBe("Updated Azure Backup");
			}
		});
	});
});
