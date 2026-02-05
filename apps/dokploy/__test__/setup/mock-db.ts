import { vi } from "vitest";

// Mock postgres to prevent actual database connections
vi.mock("postgres", () => {
	return {
		default: vi.fn(() => ({
			end: vi.fn(),
			unsafe: vi.fn(),
		})),
	};
});

// Mock the db export from @dokploy/server/db
vi.mock("@dokploy/server/db", () => {
	const createChainableMock = (): any => {
		const chain: any = {
			set: vi.fn(() => chain),
			where: vi.fn(() => chain),
			returning: vi.fn().mockResolvedValue([{}]),
			execute: vi.fn().mockResolvedValue([{}]),
		};
		return chain;
	};

	return {
		db: {
			select: vi.fn(() => createChainableMock()),
			insert: vi.fn(() => createChainableMock()),
			update: vi.fn(() => createChainableMock()),
			delete: vi.fn(() => createChainableMock()),
			query: {
				applications: {
					findFirst: vi.fn(),
					findMany: vi.fn(),
				},
				deployments: {
					findFirst: vi.fn(),
					findMany: vi.fn(),
				},
				servers: {
					findFirst: vi.fn(),
					findMany: vi.fn(),
				},
				users: {
					findFirst: vi.fn(),
					findMany: vi.fn(),
				},
				organizations: {
					findFirst: vi.fn(),
					findMany: vi.fn(),
				},
				// Necesario para getWebServerSettings (lib/auth -> trustedOrigins)
				webServerSettings: {
					findFirst: vi.fn().mockResolvedValue(null),
					findMany: vi.fn().mockResolvedValue([]),
				},
			},
		},
		dbUrl: "postgres://mock:mock@localhost:5432/mock",
	};
});
