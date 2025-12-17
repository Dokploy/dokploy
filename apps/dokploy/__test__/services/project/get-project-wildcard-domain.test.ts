import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@dokploy/server/db";
import { getProjectWildcardDomain } from "@dokploy/server/services/project";
let findFirstSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
        findFirstSpy = vi.spyOn(db.query.projects, "findFirst");
});

afterEach(() => {
        vi.restoreAllMocks();
});

describe("getProjectWildcardDomain", () => {
        it("returns the project wildcard when set", async () => {
                findFirstSpy.mockResolvedValue({
                        wildcardDomain: "*.project.example.com",
                        useOrganizationWildcard: true,
                        organization: { wildcardDomain: "*.org.example.com" },
                } as never);

                const result = await getProjectWildcardDomain("project-1");

                expect(result).toBe("*.project.example.com");
                expect(findFirstSpy).toHaveBeenCalledWith({
                        where: expect.anything(),
                        with: { organization: true },
                });
        });

        it("falls back to the organization's wildcard when inheritance is enabled", async () => {
                findFirstSpy.mockResolvedValue({
                        wildcardDomain: null,
                        useOrganizationWildcard: true,
                        organization: { wildcardDomain: "*.org.example.com" },
                } as never);

                const result = await getProjectWildcardDomain("project-2");

                expect(result).toBe("*.org.example.com");
        });

        it("returns null when neither project nor organization wildcards are available", async () => {
                findFirstSpy.mockResolvedValue({
                        wildcardDomain: null,
                        useOrganizationWildcard: false,
                        organization: { wildcardDomain: "*.org.example.com" },
                } as never);

                const result = await getProjectWildcardDomain("project-3");

                expect(result).toBeNull();
        });
});
