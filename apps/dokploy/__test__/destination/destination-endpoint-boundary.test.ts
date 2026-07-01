import {
	assertRcloneS3DestinationAllowed,
	buildRcloneS3Command,
} from "@dokploy/server/utils/backups/utils";
import {
	assertDestinationEndpointAllowed,
	normalizeDestinationEndpointUrl,
} from "@dokploy/server/utils/destination/endpoint";
import { describe, expect, it } from "vitest";

const { apiCreateDestination } = await import("@dokploy/server/db/schema");

const safeDestinationInput = {
	accessKey: "access",
	additionalFlags: [],
	bucket: "bucket",
	endpoint: "https://s3.example.com",
	name: "S3",
	provider: "AWS",
	region: "auto",
	secretAccessKey: "secret",
};

describe("destination S3 endpoint boundary", () => {
	it("rejects unsafe cloud S3 endpoints before rclone can use them", () => {
		for (const endpoint of [
			"http://s3.example.com",
			"https://127.0.0.1:9000",
			"https://169.254.169.254/latest",
			"https://[::1]:9000",
			"https://[fe90::1]:9000",
			"https://[fea0::1]:9000",
			"https://[febf::1]:9000",
			"https://s3.internal",
			"https://user:pass@s3.example.com",
			"https://s3.example.com/bucket",
			"https://s3.example.com?token=secret",
		]) {
			expect(() =>
				normalizeDestinationEndpointUrl(endpoint, {
					allowPrivateNetwork: false,
				}),
			).toThrow(/S3 endpoint/i);
		}
	});

	it("rejects public-looking S3 endpoint hostnames that resolve to private addresses", async () => {
		await expect(
			assertDestinationEndpointAllowed("https://s3.example.com", {
				allowPrivateNetwork: false,
				lookup: async () => [{ address: "10.0.0.10", family: 4 }],
			}),
		).rejects.toThrow(/S3 endpoint/i);
	});

	it("normalizes public S3 endpoints that resolve only to public addresses", async () => {
		await expect(
			assertDestinationEndpointAllowed("https://s3.example.com/", {
				allowPrivateNetwork: false,
				lookup: async () => [{ address: "8.8.8.8", family: 4 }],
			}),
		).resolves.toBe("https://s3.example.com");
	});

	it("preserves private self-hosted S3 endpoints when private networks are allowed", async () => {
		await expect(
			assertDestinationEndpointAllowed("http://127.0.0.1:9000/", {
				allowPrivateNetwork: true,
				lookup: async () => {
					throw new Error("lookup should not run");
				},
			}),
		).resolves.toBe("http://127.0.0.1:9000");
	});

	it("revalidates stored S3 endpoints before building rclone commands in cloud mode", async () => {
		const previousCloud = process.env.IS_CLOUD;
		process.env.IS_CLOUD = "true";
		try {
			const destination = {
				accessKey: "access",
				secretAccessKey: "secret",
				region: "auto",
				endpoint: "https://127.0.0.1:9000",
				provider: "AWS",
				additionalFlags: [],
				bucket: "bucket",
			};

			expect(() =>
				buildRcloneS3Command("ls", destination, [":s3:bucket"]),
			).toThrow(/S3 endpoint/i);
			await expect(
				assertRcloneS3DestinationAllowed(destination),
			).rejects.toThrow(/S3 endpoint/i);
		} finally {
			if (previousCloud === undefined) {
				delete process.env.IS_CLOUD;
			} else {
				process.env.IS_CLOUD = previousCloud;
			}
		}
	});

	it("rejects additional rclone flags that override protected S3 connection settings", async () => {
		const destination = {
			accessKey: "access",
			secretAccessKey: "secret",
			region: "auto",
			endpoint: "https://s3.example.com",
			provider: "AWS",
			additionalFlags: ["--s3-endpoint=https://127.0.0.1:9000"],
			bucket: "bucket",
		};

		expect(() =>
			buildRcloneS3Command("ls", destination, [":s3:bucket"]),
		).toThrow(/Additional flags can only use explicitly allowed/i);
		await expect(assertRcloneS3DestinationAllowed(destination)).rejects.toThrow(
			/Additional flags can only use explicitly allowed/i,
		);

		expect(
			apiCreateDestination.safeParse({
				...safeDestinationInput,
				additionalFlags: ["--s3-endpoint=https://127.0.0.1:9000"],
			}).success,
		).toBe(false);
		expect(
			apiCreateDestination.safeParse({
				...safeDestinationInput,
				additionalFlags: ["--config=/tmp/rclone.conf"],
			}).success,
		).toBe(false);
		expect(
			apiCreateDestination.safeParse({
				...safeDestinationInput,
				additionalFlags: ["--s3-provider=Minio"],
			}).success,
		).toBe(false);
		expect(
			apiCreateDestination.safeParse({
				...safeDestinationInput,
				additionalFlags: ["--s3-new-endpoint-like-flag=value"],
			}).success,
		).toBe(false);
		expect(
			apiCreateDestination.safeParse({
				...safeDestinationInput,
				additionalFlags: ["--s3-sign-accept-encoding=false"],
			}).success,
		).toBe(true);
	});

	it("rejects broad rclone global flags with filesystem or debug side effects", async () => {
		for (const flag of [
			"--log-file=/tmp/rclone.log",
			"--dump=auth",
			"--dump=headers",
			"--rc",
			"--files-from=/tmp/files.txt",
		]) {
			const destination = {
				accessKey: "access",
				secretAccessKey: "secret",
				region: "auto",
				endpoint: "https://s3.example.com",
				provider: "AWS",
				additionalFlags: [flag],
				bucket: "bucket",
			};

			expect(() =>
				buildRcloneS3Command("ls", destination, [":s3:bucket"]),
			).toThrow(/Additional flags can only use explicitly allowed/i);
			await expect(
				assertRcloneS3DestinationAllowed(destination),
			).rejects.toThrow(/Additional flags can only use explicitly allowed/i);

			expect(
				apiCreateDestination.safeParse({
					...safeDestinationInput,
					additionalFlags: [flag],
				}).success,
			).toBe(false);
		}
	});
});
