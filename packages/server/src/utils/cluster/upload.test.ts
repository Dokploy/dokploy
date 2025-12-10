import { getRegistryTag } from "./upload";

interface Registry {
	registryUrl: string;
	imagePrefix: string;
	username: string;
}

interface TestCase {
	name: string;
	registry: Registry;
	imageName: string;
	expected: string;
}

describe("getRegistryTag - Image Tag Resolution", () => {
	const testCases: TestCase[] = [
		{
			name: "Uses imagePrefix when available",
			registry: {
				registryUrl: "ghcr.io",
				imagePrefix: "my-org",
				username: "ignored-user",
			},
			imageName: "repo-app",
			expected: "ghcr.io/my-org/repo-app",
		},
		{
			name: "Uses username if imagePrefix is empty",
			registry: {
				registryUrl: "docker.io",
				imagePrefix: "",
				username: "test-user",
			},
			imageName: "nginx",
			expected: "docker.io/test-user/nginx",
		},
		{
			name: "Image with tag",
			registry: {
				registryUrl: "docker.io",
				imagePrefix: "",
				username: "user",
			},
			imageName: "nginx:latest",
			expected: "docker.io/user/nginx:latest",
		},
		{
			name: "Should not duplicate namespace if imageName already starts with imagePrefix",
			registry: {
				registryUrl: "ghcr.io",
				imagePrefix: "my-org",
				username: "user",
			},
			imageName: "my-org/repo-app:v2",
			expected: "ghcr.io/my-org/repo-app:v2",
		},
		{
			name: "Should not duplicate namespace if imageName already starts with username",
			registry: {
				registryUrl: "custom.io",
				imagePrefix: "",
				username: "my-user",
			},
			imageName: "my-user/app-image",
			expected: "custom.io/my-user/app-image",
		},
		{
			name: "Registry URL without trailing slash",
			registry: {
				registryUrl: "docker.io",
				imagePrefix: "my-org",
				username: "",
			},
			imageName: "test-image",
			expected: "docker.io/my-org/test-image",
		},
		{
			name: "No registry URL",
			registry: { registryUrl: "", imagePrefix: "official", username: "" },
			imageName: "ubuntu:latest",
			expected: "official/ubuntu:latest",
		},
		{
			name: "No registry info (no namespace or url)",
			registry: { registryUrl: "", imagePrefix: "", username: "" },
			imageName: "my-app:v1",
			expected: "my-app:v1",
		},
	];

	testCases.forEach(({ name, registry, imageName, expected }) => {
		it(name, () => {
			const result = getRegistryTag(registry, imageName);
			expect(result).toBe(expected);
		});
	});
});
