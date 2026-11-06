import {
	applyResourceProfilesToSpecification,
	findResourceProfileInOrganization,
	resolveEffectiveResources,
} from "@dokploy/server/services/resource-profile";
import { addDomainToCompose } from "@dokploy/server/utils/docker/domain";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	where: vi.fn(),
	findProfile: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		select: () => ({ from: () => ({ where: mocks.where }) }),
		query: { resourceProfile: { findFirst: mocks.findProfile } },
	},
}));

const profile = {
	profileId: "profile-1",
	name: "API",
	groupId: "group-1",
	memoryLimit: "1073741824",
	memoryReservation: "536870912",
	cpuLimit: "500000000",
	cpuReservation: "250000000",
	createdAt: new Date(),
};

type ComposeServiceAssignment = {
	composeServiceId: string;
	composeId: string;
	serviceName: string;
	profileId: string | null;
	memoryLimit: string | null;
	memoryReservation: string | null;
	cpuLimit: string | null;
	cpuReservation: string | null;
};

const assignment: ComposeServiceAssignment = {
	composeServiceId: "assignment-1",
	composeId: "compose-1",
	serviceName: "web",
	profileId: "profile-1",
	memoryLimit: null,
	memoryReservation: null,
	cpuLimit: null,
	cpuReservation: null,
};

const mockAssignments = (...assignments: ComposeServiceAssignment[]) => {
	mocks.where
		.mockResolvedValueOnce(assignments)
		.mockResolvedValueOnce([profile]);
};

beforeEach(() => {
	mocks.where.mockReset();
	mocks.findProfile.mockReset();
});

describe("resolveEffectiveResources", () => {
	it("inherits only the fields the service does not override", async () => {
		mocks.findProfile.mockResolvedValue(profile);

		const resources = await resolveEffectiveResources({
			resourceProfileId: "profile-1",
			memoryLimit: "2147483648",
			memoryReservation: null,
			cpuLimit: null,
			cpuReservation: null,
		});

		expect(resources).toEqual({
			Limits: { MemoryBytes: 2147483648, NanoCPUs: 500000000 },
			Reservations: { MemoryBytes: 536870912, NanoCPUs: 250000000 },
		});
	});

	it("uses the service values as-is without a profile", async () => {
		const resources = await resolveEffectiveResources({
			resourceProfileId: null,
			memoryLimit: "1048576",
			memoryReservation: null,
			cpuLimit: null,
			cpuReservation: null,
		});

		expect(mocks.findProfile).not.toHaveBeenCalled();
		expect(resources.Limits?.MemoryBytes).toBe(1048576);
		expect(resources.Limits?.NanoCPUs).toBeUndefined();
	});
});

describe("findResourceProfileInOrganization", () => {
	it("rejects a profile owned by another organization", async () => {
		mocks.findProfile.mockResolvedValue({
			...profile,
			group: { organizationId: "org-b" },
		});

		await expect(
			findResourceProfileInOrganization("profile-1", "org-a"),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("returns a profile owned by the organization", async () => {
		mocks.findProfile.mockResolvedValue({
			...profile,
			group: { organizationId: "org-a" },
		});

		await expect(
			findResourceProfileInOrganization("profile-1", "org-a"),
		).resolves.toMatchObject({ profileId: "profile-1" });
	});
});

describe("applyResourceProfilesToSpecification", () => {
	it("injects the profile only into assigned services", async () => {
		mockAssignments(assignment);
		const spec: ComposeSpecification = {
			services: { web: { image: "nginx" }, db: { image: "postgres" } },
		};

		const result = await applyResourceProfilesToSpecification(
			"compose-1",
			spec,
		);

		expect(result.services?.web?.deploy?.resources).toEqual({
			limits: { memory: "1073741824", cpus: "0.5" },
			reservations: { memory: "536870912", cpus: "0.25" },
		});
		expect(result.services?.db?.deploy).toBeUndefined();
	});

	it("wins over deploy.resources from the file, per field", async () => {
		mockAssignments({ ...assignment, cpuLimit: "750000000" });
		const spec: ComposeSpecification = {
			services: {
				web: {
					image: "nginx",
					deploy: {
						replicas: 2,
						resources: { limits: { memory: "1g", pids: 100 } },
					},
				},
			},
		};

		const result = await applyResourceProfilesToSpecification(
			"compose-1",
			spec,
		);

		const deploy = result.services?.web?.deploy;
		expect(deploy?.replicas).toBe(2);
		expect(deploy?.resources?.limits).toEqual({
			memory: "1073741824",
			cpus: "0.75",
			pids: 100,
		});
	});

	it("ignores assignments for services no longer in the file", async () => {
		mockAssignments({ ...assignment, serviceName: "removed" });
		const spec: ComposeSpecification = {
			services: { web: { image: "nginx" } },
		};

		const result = await applyResourceProfilesToSpecification(
			"compose-1",
			spec,
		);

		expect(result.services?.web?.deploy).toBeUndefined();
	});
});

describe("addDomainToCompose", () => {
	const raw = {
		appName: "app",
		composeId: "compose-1",
		composeFile: "services:\n  web:\n    image: nginx\n",
		composeType: "docker-compose",
		sourceType: "raw",
	};

	// The settings UI lists the suffixed names of a randomized compose, so that
	// is what assignments are saved under.
	it("matches assignments against randomized service names", async () => {
		mockAssignments({ ...assignment, serviceName: "web-abc" });

		const result = await addDomainToCompose(
			{ ...raw, randomize: true, suffix: "abc" } as never,
			[],
		);

		expect(result?.services?.["web-abc"]?.deploy?.resources?.limits).toEqual({
			memory: "1073741824",
			cpus: "0.5",
		});
	});
});
