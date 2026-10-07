import { TRPCError, tracked } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const cleanup = vi.fn();

const router = createTRPCRouter({
	unreachableAfterOne: publicProcedure.subscription(async function* () {
		yield "first";
		throw socketError("EHOSTUNREACH", "31.57.34.138", 22);
	}),
	unreachableBeforeAny: publicProcedure.subscription(async function* () {
		throw new Error("setup failed", {
			cause: socketError("ETIMEDOUT", "203.0.113.9", 22),
		});
		yield "never";
	}),
	ordinary: publicProcedure.subscription(async function* () {
		yield "first";
		throw new Error("boom");
	}),
	notFound: publicProcedure.subscription(async function* () {
		yield "first";
		throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
	}),
	otherPort: publicProcedure.subscription(async function* () {
		yield "first";
		throw socketError("ECONNREFUSED", "93.184.216.34", 443);
	}),
	endless: publicProcedure.subscription(async function* () {
		try {
			let i = 0;
			while (true) yield i++;
		} finally {
			cleanup();
		}
	}),
	trackedEvents: publicProcedure.subscription(async function* () {
		yield tracked("evt-1", { n: 1 });
		yield tracked("evt-2", { n: 2 });
	}),
	observableUnreachable: publicProcedure.subscription(() =>
		observable<string>((emit) => {
			emit.next("first");
			emit.error(socketError("EHOSTUNREACH", "31.57.34.138", 22));
		}),
	),
	observableOrdinary: publicProcedure.subscription(() =>
		observable<string>((emit) => {
			emit.error(new Error("boom"));
		}),
	),
	// Not a subscription: a plain object with a `subscribe` key is data.
	looksLikeObservable: publicProcedure.query(() => ({
		subscribe: "weekly",
		plan: "pro",
	})),
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

const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

describe("remote-unreachable tRPC middleware (subscriptions)", () => {
	beforeEach(() => {
		warn.mockClear();
		cleanup.mockClear();
	});

	it("maps an unreachable server thrown mid-stream to SERVICE_UNAVAILABLE", async () => {
		const iterable = await caller.unreachableAfterOne();
		const iterator = iterable[Symbol.asyncIterator]();

		await expect(iterator.next()).resolves.toEqual({
			done: false,
			value: "first",
		});
		const error = await failure(() => iterator.next());
		expect(error).toBeInstanceOf(TRPCError);
		expect(error.code).toBe("SERVICE_UNAVAILABLE");
		expect(error.message).toContain("31.57.34.138:22");
		expect(error.message).toContain("EHOSTUNREACH");
		expect(error.message).toContain("online and reachable over SSH");
		expect((error.cause as NodeJS.ErrnoException).code).toBe("EHOSTUNREACH");

		expect(warn).toHaveBeenCalledTimes(1);
		const line = String(warn.mock.calls[0]?.[0]);
		expect(line).toContain("unreachableAfterOne");
		expect(line).toContain("31.57.34.138:22");
	});

	it("maps a failure thrown before the first value, through the cause chain", async () => {
		const iterable = await caller.unreachableBeforeAny();
		const error = await failure(async () => {
			for await (const _ of iterable) {
			}
		});
		expect(error.code).toBe("SERVICE_UNAVAILABLE");
		expect(error.message).toContain("203.0.113.9:22");
	});

	it("passes a non-network error through unchanged", async () => {
		const iterator = (await caller.ordinary())[Symbol.asyncIterator]();
		await iterator.next();
		const error = await failure(() => iterator.next());
		expect(error).not.toBeInstanceOf(TRPCError);
		expect(error.message).toBe("boom");
		expect(warn).not.toHaveBeenCalled();
	});

	it("passes deliberate TRPCErrors through unchanged", async () => {
		const iterator = (await caller.notFound())[Symbol.asyncIterator]();
		await iterator.next();
		const error = await failure(() => iterator.next());
		expect(error.code).toBe("NOT_FOUND");
		expect(error.message).toBe("Server not found");
	});

	it("leaves a connect failure on an unrelated port unchanged", async () => {
		const iterator = (await caller.otherPort())[Symbol.asyncIterator]();
		await iterator.next();
		const error = await failure(() => iterator.next());
		expect(error).not.toBeInstanceOf(TRPCError);
		expect(error.message).toBe("connect ECONNREFUSED 93.184.216.34:443");
	});

	it("forwards return() so the generator's finally block runs", async () => {
		const iterator = (await caller.endless())[Symbol.asyncIterator]();
		await expect(iterator.next()).resolves.toEqual({ done: false, value: 0 });
		await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
		expect(cleanup).not.toHaveBeenCalled();

		await expect(iterator.return?.()).resolves.toEqual({
			done: true,
			value: undefined,
		});
		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it("runs the generator's finally block when a for-await consumer breaks", async () => {
		for await (const value of await caller.endless()) {
			if (value === 2) break;
		}
		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it("forwards values as they arrive, tracked() envelopes intact", async () => {
		const values: unknown[] = [];
		for await (const value of await caller.trackedEvents()) {
			values.push(value);
		}
		expect(values).toHaveLength(2);
		expect(values[0]).toEqual(tracked("evt-1", { n: 1 }));
		expect(values[1]).toEqual(tracked("evt-2", { n: 2 }));
	});

	it("maps an unreachable server passed to an observable's emit.error", async () => {
		const source = await caller.observableUnreachable();
		const next = vi.fn();
		const error = await new Promise<TRPCError>((resolve) => {
			source.subscribe({ next, error: resolve, complete: () => {} });
		});
		expect(next).toHaveBeenCalledWith("first");
		expect(error.code).toBe("SERVICE_UNAVAILABLE");
		expect(error.message).toContain("31.57.34.138:22");
	});

	it("passes other observable errors through unchanged", async () => {
		const source = await caller.observableOrdinary();
		const error = await new Promise<Error>((resolve) => {
			source.subscribe({ next: () => {}, error: resolve, complete: () => {} });
		});
		expect(error).not.toBeInstanceOf(TRPCError);
		expect(error.message).toBe("boom");
	});

	it("does not wrap data returned by a query", async () => {
		await expect(caller.looksLikeObservable()).resolves.toEqual({
			subscribe: "weekly",
			plan: "pro",
		});
	});
});
