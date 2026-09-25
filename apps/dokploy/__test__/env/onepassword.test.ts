import { beforeEach, describe, expect, it, vi } from "vitest";
import { onePasswordClient } from "../../../../packages/server/src/utils/vault/onepassword";

const sdk = vi.hoisted(() => ({
	getVariables: vi.fn(async () => ({
		variables: [
			{ name: "API_KEY", value: "example-value", masked: true },
			{ name: "EMPTY_VALUE", value: "", masked: true },
		],
	})),
}));

vi.mock("@1password/sdk", () => ({
	createClient: async () => ({
		environments: { getVariables: sdk.getVariables },
	}),
}));

const config = {
	providerType: "onepassword" as const,
	environmentId: "environment-id",
	serviceAccountToken: "test-token",
};

describe("1Password Environments provider", () => {
	beforeEach(() => sdk.getVariables.mockClear());

	it("resolves variables by exact name, including an empty value", async () => {
		const values = await onePasswordClient.getSecrets(config, [
			"API_KEY",
			"EMPTY_VALUE",
		]);
		expect(values).toEqual({ API_KEY: "example-value", EMPTY_VALUE: "" });
		expect(sdk.getVariables).toHaveBeenCalledExactlyOnceWith("environment-id");
	});

	it("does not silently deploy an unresolved variable", async () => {
		await expect(
			onePasswordClient.getSecrets(config, ["MISSING_KEY"]),
		).rejects.toThrow('variable "MISSING_KEY" was not found');
	});

	it("lists only variable names for import", async () => {
		await expect(onePasswordClient.listSecretNames?.(config)).resolves.toEqual([
			"API_KEY",
			"EMPTY_VALUE",
		]);
	});

	it("tests access to the configured Environment", async () => {
		await onePasswordClient.testConnection(config);
		expect(sdk.getVariables).toHaveBeenCalledExactlyOnceWith("environment-id");
	});
});
