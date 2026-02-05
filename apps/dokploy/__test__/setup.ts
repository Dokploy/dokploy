import { vi } from "vitest";

/**
 * Mock the DB module so tests that import from @dokploy/server (barrel)
 * never open a real TCP connection to PostgreSQL (e.g. in CI where no DB runs).
 * Without this, loading the server barrel pulls in lib/auth and db, which
 * connect to localhost:5432 and cause ECONNREFUSED.
 */
vi.mock("@dokploy/server/db", () => {
	const chain = () => chain;
	chain.set = () => chain;
	chain.where = () => chain;
	chain.values = () => chain;
	chain.returning = () => Promise.resolve([{}]);
	chain.then = undefined;

	const tableMock = {
		findFirst: vi.fn(() => Promise.resolve(undefined)),
		findMany: vi.fn(() => Promise.resolve([])),
		insert: vi.fn(() => Promise.resolve([{}])),
		update: vi.fn(() => chain),
		delete: vi.fn(() => chain),
	};
	const createQueryMock = () => tableMock;

	return {
		db: {
			select: vi.fn(() => chain),
			insert: vi.fn(() => ({
				values: () => ({ returning: () => Promise.resolve([{}]) }),
			})),
			update: vi.fn(() => chain),
			delete: vi.fn(() => chain),
			query: new Proxy({} as Record<string, typeof tableMock>, {
				get: () => tableMock,
			}),
		},
		dbUrl: "postgres://mock:mock@localhost:5432/mock",
	};
});
