/**
 * This is the client-side entrypoint for your tRPC API. It is used to create the `api` object which
 * contains the Next.js App-wrapper, as well as your type-safe React Query hooks.
 *
 * We also create a few inference helpers for input and output types.
 */

import {
	createWSClient,
	experimental_formDataLink,
	httpBatchLink,
	splitLink,
	wsLink,
} from "@trpc/client";
import { createTRPCNext } from "@trpc/next";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";
import type { AppRouter } from "@/server/api/root";

const getBaseUrl = () => {
	if (typeof window !== "undefined") return ""; // browser should use relative url
	return `http://localhost:${process.env.PORT ?? 3000}`; // dev SSR should use localhost
};

const getWsUrl = () => {
	if (typeof window === "undefined") return null;

	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const host = window.location.host;

	return `${protocol}${host}/drawer-logs`;
};

// Create WebSocket client with delayed connection
const createLazyWSClient = () => {
	if (typeof window === "undefined") return null;

	let actualClient: ReturnType<typeof createWSClient> | null = null;

	return {
		request: (op: any, callbacks: any) => {
			if (!actualClient) {
				const wsUrl = getWsUrl();
				if (wsUrl) {
					actualClient = createWSClient({ url: wsUrl });
				}
			}
			return actualClient?.request(op, callbacks) || (() => {});
		},
		close: () => {
			if (actualClient) {
				actualClient.close();
				actualClient = null;
			}
		},
		getConnection: () => {
			if (!actualClient) {
				const wsUrl = getWsUrl();
				if (wsUrl) {
					actualClient = createWSClient({ url: wsUrl });
				}
			}
			return actualClient!.getConnection();
		},
	};
};

const wsClient = createLazyWSClient();

/** A set of type-safe react-query hooks for your tRPC API. */
export const api = createTRPCNext<AppRouter>({
	config() {
		return {
			/**
			 * Transformer used for data de-serialization from the server.
			 *
			 * @see https://trpc.io/docs/data-transformers
			 */
			transformer: superjson,

			/**
			 * Links used to determine request flow from client to server.
			 *
			 * @see https://trpc.io/docs/links
			 */
			links: [
				splitLink({
					condition: (op) => op.type === "subscription",
					true: wsLink({
						client: wsClient!,
					}),
					false: splitLink({
						condition: (op) => op.input instanceof FormData,
						true: experimental_formDataLink({
							url: `${getBaseUrl()}/api/trpc`,
						}),
						false: httpBatchLink({
							url: `${getBaseUrl()}/api/trpc`,
						}),
					}),
				}),
			],
		};
	},
	/**
	 * Whether tRPC should await queries when server rendering pages.
	 *
	 * @see https://trpc.io/docs/nextjs#ssr-boolean-default-false
	 */
	ssr: false,
});

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
