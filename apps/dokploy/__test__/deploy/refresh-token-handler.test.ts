import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	applicationsFindFirst: vi.fn(),
	queueAdd: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((field: string, value: unknown) => ({ field, value })),
}));

vi.mock("@/server/db/schema", () => ({
	applications: {
		refreshToken: "application.refreshToken",
	},
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: {
				findFirst: mocks.applicationsFindFirst,
			},
		},
	},
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	shouldDeploy: vi.fn(() => true),
	getBitbucketHeaders: vi.fn(() => ({})),
}));

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: {
		add: mocks.queueAdd,
	},
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: vi.fn(),
}));

import handler from "@/pages/api/deploy/[refreshToken]";

const IMAGE = "ghcr.io/dokploy/app";

const createResponse = () => {
	const res = {
		status: vi.fn(),
		json: vi.fn(),
	} as unknown as NextApiResponse & {
		status: ReturnType<typeof vi.fn>;
		json: ReturnType<typeof vi.fn>;
	};

	res.status.mockImplementation(() => res);
	res.json.mockImplementation(() => res);

	return res;
};

const createRequest = (headers: Record<string, string>, body: unknown) =>
	({
		query: { refreshToken: "refresh-token" },
		headers,
		body,
	}) as unknown as NextApiRequest;

// Trimmed from real deliveries for a single `docker/github-builder` push:
// per-platform manifests and the index arrive untagged, tags arrive last
const createRegistryPackageRequest = (tag: string, mediaType: string) =>
	createRequest(
		{ "x-github-event": "registry_package" },
		{
			action: "published",
			registry_package: {
				package_version: {
					version:
						"sha256:ad66dd7acea330b3e20ca2f172cc7ac170ff094a005c7bc9ef27f5f6019a7c58",
					package_url: `${IMAGE}:${tag}`,
					container_metadata: {
						tag: {
							name: tag,
							digest:
								"sha256:ad66dd7acea330b3e20ca2f172cc7ac170ff094a005c7bc9ef27f5f6019a7c58",
						},
						manifest: { media_type: mediaType },
					},
				},
			},
		},
	);

const MANIFEST = "application/vnd.oci.image.manifest.v1+json";
const INDEX = "application/vnd.oci.image.index.v1+json";

describe("Deploy webhook for docker applications", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });
		mocks.applicationsFindFirst.mockResolvedValue({
			applicationId: "application-id",
			sourceType: "docker",
			dockerImage: `${IMAGE}:latest`,
			autoDeploy: true,
			serverId: null,
		});
	});

	it.each([
		["manifest", MANIFEST],
		["index", INDEX],
	])("skips untagged registry_package events (%s)", async (_, mediaType) => {
		const res = createResponse();

		await handler(createRegistryPackageRequest("", mediaType), res);

		expect(res.status).toHaveBeenCalledExactlyOnceWith(200);
		expect(res.json).toHaveBeenCalledWith({
			message: "Untagged image version, skipping deployment",
		});
		expect(mocks.queueAdd).not.toHaveBeenCalled();
	});

	it("deploys registry_package events for the configured tag", async () => {
		const res = createResponse();

		await handler(createRegistryPackageRequest("latest", INDEX), res);

		expect(res.status).toHaveBeenCalledExactlyOnceWith(200);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
		expect(mocks.queueAdd.mock.calls[0]?.[1]).toMatchObject({
			applicationId: "application-id",
			type: "deploy",
		});
	});

	it.each([
		"sha-8903ce2",
		"sha256-ad66dd7acea330b3e20ca2f172cc7ac170ff094a005c7bc9ef27f5f6019a7c58",
	])("rejects registry_package events for other tags (%s)", async (tag) => {
		const res = createResponse();

		await handler(createRegistryPackageRequest(tag, INDEX), res);

		expect(res.status).toHaveBeenCalledExactlyOnceWith(301);
		expect(mocks.queueAdd).not.toHaveBeenCalled();
	});

	it("deploys the configured image when the request has no image info", async () => {
		const res = createResponse();

		await handler(createRequest({}, {}), res);

		expect(res.status).toHaveBeenCalledExactlyOnceWith(200);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});

	it("deploys Docker Hub webhooks for the configured tag", async () => {
		mocks.applicationsFindFirst.mockResolvedValue({
			applicationId: "application-id",
			sourceType: "docker",
			dockerImage: "dokploy/app:latest",
			autoDeploy: true,
			serverId: null,
		});
		const res = createResponse();

		await handler(
			createRequest(
				{ "user-agent": "Go-http-client/1.1" },
				{
					push_data: { tag: "latest" },
					repository: { repo_name: "dokploy/app" },
				},
			),
			res,
		);

		expect(res.status).toHaveBeenCalledExactlyOnceWith(200);
		expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
	});
});
