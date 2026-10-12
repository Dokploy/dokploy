import { MutationCache, QueryCache } from "@tanstack/react-query";
import {
	createWSClient,
	httpBatchLink,
	httpLink,
	splitLink,
	wsLink,
} from "@trpc/client";
import { createTRPCNext } from "@trpc/next";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";
import { TWO_FACTOR_SETUP_REQUIRED } from "@/lib/two-factor";
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

const links =
	typeof window !== "undefined"
		? [
				splitLink({
					condition: (op) => op.type === "subscription",
					true: wsLink({
						client: wsClient!,
						transformer: superjson,
					}),
					false: splitLink({
						condition: (op) => op.input instanceof FormData,
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

const isTwoFactorSetupRequiredError = (error: unknown) =>
	error instanceof Error && error.message === TWO_FACTOR_SETUP_REQUIRED;

// Catches a 2FA requirement switched on mid-session.
const redirectIfTwoFactorSetupRequired = (error: unknown) => {
	if (
		typeof window !== "undefined" &&
		isTwoFactorSetupRequiredError(error) &&
		window.location.pathname !== "/two-factor-setup"
	) {
		window.location.href = "/two-factor-setup";
	}
};

export const api = createTRPCNext<AppRouter>({
	config() {
		return {
			links,
			queryClientConfig: {
				defaultOptions: {
					queries: {
						// React Query's default of 3 retries, except for this error:
						// retrying it only delays the redirect.
						retry: (failureCount, error) =>
							!isTwoFactorSetupRequiredError(error) && failureCount < 3,
					},
				},
				queryCache: new QueryCache({
					onError: redirectIfTwoFactorSetupRequired,
				}),
				mutationCache: new MutationCache({
					onError: redirectIfTwoFactorSetupRequired,
				}),
			},
		};
	},
	ssr: false,
	transformer: superjson,
});

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
