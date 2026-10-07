import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { createCallerFactory, createTRPCRouter, publicProcedure } = await import(
	"@/server/api/trpc"
);

const socketError = (code: string, address: string, port: number) =>
	Object.assign(new Error(`connect ${code} ${address}:${port}`), {
		code,
		syscall: "connect",
		address,
		port,
	});

const router = createTRPCRouter({
	unreachable: publicProcedure.query(() => {
		throw socketError("EHOSTUNREACH", "31.57.34.138", 22);
	}),
	unreachableNested: publicProcedure.mutation(() => {
		throw new Error("docker failed", {
			cause: socketError("ETIMEDOUT", "203.0.113.9", 22),
		});
	}),
	customPort: publicProcedure.query(() => {
		throw socketError("ECONNREFUSED", "10.0.0.5", 2222);
	}),
	otherPort: publicProcedure.query(() => {
		throw socketError("ECONNREFUSED", "93.184.216.34", 443);
	}),
	localSocket: publicProcedure.query(() => {
		throw Object.assign(
			new Error("connect ECONNREFUSED /var/run/docker.sock"),
			{
				code: "ECONNREFUSED",
				syscall: "connect",
				address: "/var/run/docker.sock",
			},
		);
	}),
	notFound: publicProcedure.query(() => {
		throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
	}),
	ordinary: publicProcedure.query(() => {
		throw new Error("boom");
	}),
	withInput: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(({ input }) => input.id),
});

const caller = createCallerFactory(router)({
	user: null,
	session: null,
	req: {} as unknown,
	res: {} as unknown,
} as never);

const failure = async (run: () => Promise<unknown>) => {
	try {
		await run();
	} catch (error) {
		return error as TRPCError;
	}
	throw new Error("expected the procedure to throw");
};

/** Bound parameter values of a drizzle SQL expression, in order. */
const sqlParams = (node: unknown): unknown[] => {
	if (!node || typeof node !== "object") return [];
	const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
	if (Array.isArray(chunks)) return chunks.flatMap(sqlParams);
	if (node.constructor?.name === "Param") {
		return [(node as { value: unknown }).value];
	}
	return [];
};

const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

describe("remote-unreachable tRPC middleware", () => {
	beforeEach(() => {
		warn.mockClear();
	});

	it("turns an unreachable remote server into SERVICE_UNAVAILABLE with a clear message", async () => {
		const error = await failure(() => caller.unreachable());
		expect(error).toBeInstanceOf(TRPCError);
		expect(error.code).toBe("SERVICE_UNAVAILABLE");
		expect(error.message).toContain("31.57.34.138:22");
		expect(error.message).toContain("EHOSTUNREACH");
		expect(error.message).toContain("online and reachable over SSH");
		// the original failure stays attached for debugging
		expect((error.cause as NodeJS.ErrnoException).code).toBe("EHOSTUNREACH");
	});

	it("converts mutations and nested causes too", async () => {
		const error = await failure(() => caller.unreachableNested());
		expect(error.code).toBe("SERVICE_UNAVAILABLE");
		expect(error.message).toContain("203.0.113.9:22");
	});

	it("logs a one-line warning with the path and host:port/code when it maps", async () => {
		await failure(() => caller.unreachable());
		expect(warn).toHaveBeenCalledTimes(1);
		const line = String(warn.mock.calls[0]?.[0]);
		expect(line).toContain("unreachable");
		expect(line).toContain("31.57.34.138:22");
		expect(line).toContain("EHOSTUNREACH");
	});

	it("recognises a non-default SSH port that belongs to a configured server", async () => {
		const findFirst = vi.mocked(db.query.server.findFirst);
		findFirst.mockClear();
		findFirst.mockResolvedValueOnce({ serverId: "srv-1" } as never);
		const error = await failure(() => caller.customPort());
		expect(error.code).toBe("SERVICE_UNAVAILABLE");
		expect(error.message).toContain("10.0.0.5:2222");

		// the lookup must be scoped to exactly this host and port
		expect(findFirst).toHaveBeenCalledTimes(1);
		const { where } = findFirst.mock.calls[0]?.[0] as { where: unknown };
		expect(sqlParams(where)).toEqual(["10.0.0.5", 2222]);
	});

	it("keeps the original 500 when the configured-server lookup fails", async () => {
		const findFirst = vi.mocked(db.query.server.findFirst);
		findFirst.mockClear();
		findFirst.mockRejectedValueOnce(new Error("db down"));
		const error = await failure(() => caller.customPort());
		expect(findFirst).toHaveBeenCalledTimes(1);
		expect(error.code).toBe("INTERNAL_SERVER_ERROR");
		expect(error.message).toBe("connect ECONNREFUSED 10.0.0.5:2222");
		expect(warn).not.toHaveBeenCalled();
	});

	it("leaves a connect failure on an unrelated port as a 500", async () => {
		const error = await failure(() => caller.otherPort());
		expect(error.code).toBe("INTERNAL_SERVER_ERROR");
	});

	it("leaves a local docker socket failure as a 500", async () => {
		const error = await failure(() => caller.localSocket());
		expect(error.code).toBe("INTERNAL_SERVER_ERROR");
	});

	it("leaves an ordinary error as a 500", async () => {
		const error = await failure(() => caller.ordinary());
		expect(error.code).toBe("INTERNAL_SERVER_ERROR");
		expect(error.message).toBe("boom");
	});

	it("does not touch deliberate TRPCErrors", async () => {
		const error = await failure(() => caller.notFound());
		expect(error.code).toBe("NOT_FOUND");
		expect(error.message).toBe("Server not found");
	});

	it("does not interfere with successful calls", async () => {
		await expect(caller.withInput({ id: "abc" })).resolves.toBe("abc");
	});
});
