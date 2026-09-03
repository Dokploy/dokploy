import { beforeEach, describe, expect, it, vi } from "vitest";

type HasInput = { input: Record<string, unknown> };

const findMany = vi.hoisted(() => vi.fn());

const {
	send,
	paginate,
	SSMClient,
	GetParametersCommand,
	DescribeParametersCommand,
} = vi.hoisted(() => {
	class FakeCommand {
		input: Record<string, unknown>;
		constructor(input: Record<string, unknown>) {
			this.input = input;
		}
	}
	const send = vi.fn();
	const paginate = vi.fn();
	class SSMClient {
		send(command: unknown) {
			return send(command);
		}
	}
	return {
		send,
		paginate,
		SSMClient,
		GetParametersCommand: class extends FakeCommand {},
		DescribeParametersCommand: class extends FakeCommand {},
	};
});

vi.mock("@aws-sdk/client-ssm", () => ({
	SSMClient,
	GetParametersCommand,
	DescribeParametersCommand,
	paginateDescribeParameters: paginate,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			vaultProvider: {
				findMany: (...args: unknown[]) => findMany(...args),
			},
		},
	},
}));

import { resolveVaultReferences } from "@dokploy/server/utils/vault";
import { awsParameterStoreClient } from "@dokploy/server/utils/vault/aws-parameter-store";

const config = {
	providerType: "aws-parameter-store" as const,
	region: "eu-central-1",
	accessKeyId: "AKIA_TEST",
	secretAccessKey: "secret",
};

beforeEach(() => {
	send.mockReset();
	paginate.mockReset();
	findMany.mockReset();
});

describe("awsParameterStoreClient", () => {
	it("decrypts parameters in batches of ten and preserves selectors", async () => {
		const refs = [
			"/prod/database:CURRENT",
			...Array.from({ length: 10 }, (_, index) => `/prod/secret-${index}`),
		];
		send.mockImplementation(async (command: HasInput) => ({
			Parameters: (command.input.Names as string[]).map((ref) => {
				if (ref === "/prod/database:CURRENT") {
					return {
						Name: "/prod/database",
						Selector: ":CURRENT",
						Value: "selected-value",
					};
				}
				return { Name: ref, Value: `value-for-${ref}` };
			}),
		}));

		const result = await awsParameterStoreClient.getSecrets(config, refs);

		expect(send).toHaveBeenCalledTimes(2);
		expect((send.mock.calls[0]?.[0] as HasInput).input).toMatchObject({
			WithDecryption: true,
		});
		expect(
			((send.mock.calls[0]?.[0] as HasInput).input.Names as string[]).length,
		).toBe(10);
		expect(
			((send.mock.calls[1]?.[0] as HasInput).input.Names as string[]).length,
		).toBe(1);
		expect(result["/prod/database:CURRENT"]).toBe("selected-value");
		expect(result["/prod/secret-9"]).toBe("value-for-/prod/secret-9");
	});

	it("reports a missing parameter without exposing other values", async () => {
		send.mockResolvedValue({ Parameters: [], InvalidParameters: ["/missing"] });

		await expect(
			awsParameterStoreClient.getSecrets(config, ["/missing"]),
		).rejects.toThrow('AWS Parameter Store: parameter "/missing" not found');
	});

	it("reports every missing parameter", async () => {
		send.mockResolvedValue({
			Parameters: [{ Name: "/found", Value: "secret" }],
			InvalidParameters: ["/missing-1", "/missing-2"],
		});

		await expect(
			awsParameterStoreClient.getSecrets(config, [
				"/missing-1",
				"/found",
				"/missing-2",
				"/missing-1",
			]),
		).rejects.toThrow(
			'AWS Parameter Store: parameters "/missing-1", "/missing-2" not found',
		);
	});

	it("tests the connection within the configured hierarchy", async () => {
		send.mockResolvedValue({ Parameters: [] });

		await awsParameterStoreClient.testConnection({
			...config,
			parameterPath: "/production/my-app/",
		});

		expect(send).toHaveBeenCalledTimes(1);
		expect((send.mock.calls[0]?.[0] as HasInput).input).toEqual({
			ParameterFilters: [
				{
					Key: "Path",
					Option: "Recursive",
					Values: ["/production/my-app"],
				},
			],
			MaxResults: 1,
		});
	});

	it("explains the discovery permission when connection testing is denied", async () => {
		const error = new Error("not authorized");
		error.name = "AccessDeniedException";
		send.mockRejectedValue(error);

		await expect(
			awsParameterStoreClient.testConnection(config),
		).rejects.toThrow("ssm:DescribeParameters");
	});

	it("lists parameter names across pages within the configured hierarchy", async () => {
		paginate.mockReturnValue(
			(async function* () {
				yield { Parameters: [{ Name: "/prod/db" }] };
				yield { Parameters: [{ Name: "/prod/api" }] };
			})(),
		);

		const names = await awsParameterStoreClient.listSecretNames?.({
			...config,
			parameterPath: " /production/my-app/ ",
		});

		expect(names).toEqual(["/prod/db", "/prod/api"]);
		expect(paginate).toHaveBeenCalledWith(
			expect.objectContaining({ pageSize: 50 }),
			{
				ParameterFilters: [
					{
						Key: "Path",
						Option: "Recursive",
						Values: ["/production/my-app"],
					},
				],
			},
		);
	});

	it("resolves a vault reference through the registered provider", async () => {
		findMany.mockResolvedValue([
			{
				name: "ssm-prod",
				providerType: "aws-parameter-store",
				config,
				assignments: [{ projectId: "project-1", environmentIds: [] }],
			},
		]);
		send.mockResolvedValue({
			Parameters: [{ Name: "/prod/database-password", Value: "resolved" }],
		});

		const result = await resolveVaultReferences(
			"DB_PASSWORD=${{vault.ssm-prod./prod/database-password}}",
			{
				organizationId: "organization-1",
				projectId: "project-1",
				environmentId: "environment-1",
			},
		);

		expect(result).toBe("DB_PASSWORD=resolved");
	});
});
