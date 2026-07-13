import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateApiKey } = vi.hoisted(() => ({
	mockCreateApiKey: vi.fn(),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	auth: {
		createApiKey: mockCreateApiKey,
	},
}));

vi.mock("bcrypt", () => ({
	compare: vi.fn(),
	hash: vi.fn(),
}));

const { createApiKey } = await import("@dokploy/server/services/user");

const apiKeyInput = {
	name: "Deploy key",
	metadata: {
		organizationId: "org-1",
	},
};

const prefixErrorMessage =
	"Prefix can only contain ASCII letters, numbers, underscores, and hyphens";

beforeEach(() => {
	vi.clearAllMocks();
	mockCreateApiKey.mockImplementation(async ({ body }) => {
		if (body.prefix !== undefined && !/^[A-Za-z0-9_-]+$/.test(body.prefix)) {
			throw new Error(
				"[body.prefix] Invalid prefix format, must be alphanumeric and contain only underscores and hyphens.",
			);
		}

		return {
			id: "api-key-1",
			key: "dokploy_test_key",
		};
	});
});

describe("createApiKey prefix validation", () => {
	it("allows missing prefix", async () => {
		await expect(createApiKey("user-1", apiKeyInput)).resolves.toMatchObject({
			id: "api-key-1",
		});

		expect(mockCreateApiKey).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					prefix: undefined,
				}),
			}),
		);
	});

	it.each(["dokploy_", "github-actions", "ci_cd"])(
		"allows valid prefix %s",
		async (prefix) => {
			await expect(
				createApiKey("user-1", {
					...apiKeyInput,
					prefix,
				}),
			).resolves.toMatchObject({
				id: "api-key-1",
			});

			expect(mockCreateApiKey).toHaveBeenCalledWith(
				expect.objectContaining({
					body: expect.objectContaining({
						prefix,
					}),
				}),
			);
		},
	);

	it.each(["prod deploy", "prod.deploy", "prod/deploy", "прод_"])(
		"rejects invalid prefix %s with BAD_REQUEST",
		async (prefix) => {
			await createApiKey("user-1", {
				...apiKeyInput,
				prefix,
			}).then(
				() => {
					throw new Error("Expected createApiKey to reject");
				},
				(error) => {
					expect(error).toBeInstanceOf(TRPCError);
					expect(error).toMatchObject({
						code: "BAD_REQUEST",
						message: prefixErrorMessage,
					});
				},
			);

			expect(mockCreateApiKey).not.toHaveBeenCalled();
		},
	);

	it("trims leading and trailing spaces before creating the API key", async () => {
		await expect(
			createApiKey("user-1", {
				...apiKeyInput,
				prefix: "  github-actions  ",
			}),
		).resolves.toMatchObject({
			id: "api-key-1",
		});

		expect(mockCreateApiKey).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					prefix: "github-actions",
				}),
			}),
		);
	});

	it("treats an empty trimmed prefix as undefined", async () => {
		await expect(
			createApiKey("user-1", {
				...apiKeyInput,
				prefix: "   ",
			}),
		).resolves.toMatchObject({
			id: "api-key-1",
		});

		expect(mockCreateApiKey).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					prefix: undefined,
				}),
			}),
		);
	});
});
