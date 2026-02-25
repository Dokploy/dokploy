export const baseDomainInput = {
	domainType: "application" as const,
	port: 80,
	https: false,
	certificateType: "none" as const,
};

export const mockExistingDomain = {
	domainId: "existing-domain",
	host: "example.com",
	path: null,
	createdAt: "2000-11-19",
	certificateType: "none",
	https: false,
	domainType: "application",
	port: 80,
} as any;

export const mockExistingDomainWithPath = {
	...mockExistingDomain,
	path: "/api",
} as any;

export const mockOtherDomain = {
	domainId: "other-domain",
	host: "example.com",
	path: null,
	createdAt: "2000-11-19",
	certificateType: "none",
	https: false,
	domainType: "application",
	port: 80,
} as any;

export const mockOtherDomainWithPath = {
	...mockOtherDomain,
	path: "/api",
} as any;
