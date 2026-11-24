import {
	createWSClient,
	httpBatchLink,
	httpLink,
	splitLink,
	TRPCClientError,
	type TRPCLink,
	wsLink,
} from "@trpc/client";
import { createTRPCNext } from "@trpc/next";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";
import {
	isSensitiveVerificationError,
	requestSensitiveVerification,
	VERIFICATION_CANCELLED_MESSAGE,
} from "@/lib/sensitive-action";
import type { AppRouter } from "@/server/api/root";

const getBaseUrl = () => {
	if (typeof window !== "undefined") return "";
	return `http://localhost:${process.env.PORT ?? 3000}`;
};

const getWsUrl = () => {
	if (typeof window === "undefined") return null;

	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const host = window.location.host;

	return `${protocol}${host}/drawer-logs`;
};

let wsClientSingleton: ReturnType<typeof createWSClient> | null = null;

const getOrCreateWSClient = () => {
	if (typeof window === "undefined") return null;

	if (!wsClientSingleton) {
		wsClientSingleton = createWSClient({
			url: getWsUrl()!,
			lazy: { enabled: true, closeMs: 3000 },
			retryDelayMs: () => 3000,
		});
	}

	return wsClientSingleton;
};

const wsClient = getOrCreateWSClient();

// Custom link because retryLink's callback is sync and can't wait for the verification dialog.
const sensitiveActionLink: TRPCLink<AppRouter> =
	() =>
	({ next, op }) =>
		observable((observer) => {
			let closed = false;
			let subscription = next(op).subscribe({
				next: (value) => observer.next(value),
				complete: () => observer.complete(),
				error: async (error) => {
					if (
						op.type === "subscription" ||
						!isSensitiveVerificationError(error)
					) {
						observer.error(error);
						return;
					}
					const verified = await requestSensitiveVerification();
					if (closed) return;
					if (!verified) {
						observer.error(
							TRPCClientError.from(new Error(VERIFICATION_CANCELLED_MESSAGE)),
						);
						return;
					}
					subscription = next(op).subscribe(observer);
				},
			});
			return () => {
				closed = true;
				subscription.unsubscribe();
			};
		});

const links =
	typeof window !== "undefined"
		? [
				sensitiveActionLink,
				splitLink({
					condition: (op) => op.type === "subscription",
					true: wsLink({
						client: wsClient!,
						transformer: superjson,
					}),
					false: splitLink({
						condition: (op) =>
							op.input instanceof FormData || op.context.skipBatch === true,
						true: httpLink({
							url: `${getBaseUrl()}/api/trpc`,
							transformer: superjson,
						}),
						false: httpBatchLink({
							url: `${getBaseUrl()}/api/trpc`,
							transformer: superjson,
						}),
					}),
				}),
			]
		: [
				httpBatchLink({
					url: `${getBaseUrl()}/api/trpc`,
					transformer: superjson,
				}),
			];

export const api = createTRPCNext<AppRouter>({
	config() {
		return { links };
	},
	ssr: false,
	transformer: superjson,
});

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
