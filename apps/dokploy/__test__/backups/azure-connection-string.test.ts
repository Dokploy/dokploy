import {
	parseAzureConnectionString,
	parseAzureSasUrl,
} from "@dokploy/server/utils/backups/azure";
import { describe, expect, it } from "vitest";

describe("Azure Connection String & SAS URL Parser", () => {
	it("parses standard Azure Portal connection string", () => {
		const connStr =
			"DefaultEndpointsProtocol=https;AccountName=dokploystorage;AccountKey=VGVzdEFjY291bnRLZXkxMjM0NTY3ODkwMTI=;EndpointSuffix=core.windows.net";

		const parsed = parseAzureConnectionString(connStr);
		expect(parsed.accountName).toBe("dokploystorage");
		expect(parsed.accountKey).toBe("VGVzdEFjY291bnRLZXkxMjM0NTY3ODkwMTI=");
		expect(parsed.endpoint).toBeUndefined(); // Standard core.windows.net does not need custom endpoint
	});

	it("parses Azurite local emulator connection string with BlobEndpoint", () => {
		const connStr =
			"DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";

		const parsed = parseAzureConnectionString(connStr);
		expect(parsed.accountName).toBe("devstoreaccount1");
		expect(parsed.accountKey).toBe(
			"Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
		);
		expect(parsed.endpoint).toBe("http://127.0.0.1:10000/devstoreaccount1");
	});

	it("parses sovereign / custom cloud endpoint suffix", () => {
		const connStr =
			"DefaultEndpointsProtocol=https;AccountName=govstorage;AccountKey=MyGovKey==;EndpointSuffix=core.usgovcloudapi.net";

		const parsed = parseAzureConnectionString(connStr);
		expect(parsed.accountName).toBe("govstorage");
		expect(parsed.accountKey).toBe("MyGovKey==");
		expect(parsed.endpoint).toBe(
			"https://govstorage.blob.core.usgovcloudapi.net",
		);
	});

	it("handles empty or whitespace connection strings gracefully", () => {
		expect(parseAzureConnectionString("")).toEqual({
			accountName: "",
			accountKey: "",
		});
		expect(parseAzureConnectionString("   ")).toEqual({
			accountName: "",
			accountKey: "",
		});
	});

	it("extracts account name and container from SAS URL", () => {
		const sasUrl =
			"https://mystorageaccount.blob.core.windows.net/mybackups?sp=r&st=2026-09-08T00:00:00Z&se=2026-09-09T00:00:00Z&spr=https&sv=2022-11-02&sr=c&sig=sig123";

		const { accountName, containerName } = parseAzureSasUrl(sasUrl);
		expect(accountName).toBe("mystorageaccount");
		expect(containerName).toBe("mybackups");
	});

	it("handles root SAS URL without container", () => {
		const sasUrl =
			"https://mystorageaccount.blob.core.windows.net/?sv=2022-11-02&ss=b&srt=sco&sp=rwlacup";

		const { accountName, containerName } = parseAzureSasUrl(sasUrl);
		expect(accountName).toBe("mystorageaccount");
		expect(containerName).toBeUndefined();
	});
});
