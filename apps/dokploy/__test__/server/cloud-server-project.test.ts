import { createDigitalOceanDroplet } from "@dokploy/server/utils/digitalocean";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const params = {
	name: "dokploy-test",
	size: "s-1vcpu-2gb",
	region: "tor1",
	vpcId: "vpc-1",
	sshKeyId: 1,
	organizationId: "org-1",
	cloudServerId: "cs-1",
};

const created = () =>
	new Response(JSON.stringify({ droplet: { id: 4242, name: "dokploy-test" } }));

describe("droplet project", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.stubEnv("DIGITALOCEAN_TOKEN", "token");
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockReset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("leaves the droplet where DO puts it when no project is configured", async () => {
		vi.stubEnv("DIGITALOCEAN_PROJECT_ID", "");
		fetchMock.mockResolvedValueOnce(created());

		await createDigitalOceanDroplet(params);

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("moves the new droplet into the configured project", async () => {
		vi.stubEnv("DIGITALOCEAN_PROJECT_ID", "project-1");
		fetchMock
			.mockResolvedValueOnce(created())
			.mockResolvedValueOnce(new Response(JSON.stringify({ resources: [] })));

		await createDigitalOceanDroplet(params);

		const request: Request = fetchMock.mock.calls[1]?.[0];
		expect(request.url).toMatch(/\/projects\/project-1\/resources$/);
		expect(request.method).toBe("POST");
		expect(await request.json()).toEqual({
			resources: ["do:droplet:4242"],
		});
	});

	it("still returns the droplet when the project rejects it", async () => {
		vi.stubEnv("DIGITALOCEAN_PROJECT_ID", "project-1");
		fetchMock
			.mockResolvedValueOnce(created())
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }),
			);

		const droplet = await createDigitalOceanDroplet(params);

		expect(droplet.id).toBe(4242);
	});
});
