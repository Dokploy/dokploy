import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createWSClient,
	httpBatchLink,
	httpLink,
	splitLink,
	wsLink,
} from "@trpc/client";
import { useState } from "react";
import superjson from "superjson";
import { api } from "./api";

const getWsUrl = () => {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${protocol}//${window.location.host}/drawer-logs`;
};

let wsClientSingleton: ReturnType<typeof createWSClient> | null = null;

const getOrCreateWSClient = () => {
	if (!wsClientSingleton) {
		wsClientSingleton = createWSClient({
			url: getWsUrl(),
			lazy: { enabled: true, closeMs: 3000 },
			retryDelayMs: () => 3000,
		});
	}
	return wsClientSingleton;
};

const createLinks = () => [
	splitLink({
		condition: (op) => op.type === "subscription",
		true: wsLink({
			client: getOrCreateWSClient(),
			transformer: superjson,
		}),
		false: splitLink({
			condition: (op) => op.input instanceof FormData,
			true: httpLink({
				url: "/api/trpc",
				transformer: superjson,
			}),
			false: httpBatchLink({
				url: "/api/trpc",
				transformer: superjson,
			}),
		}),
	}),
];

export const TRPCProvider = ({ children }: { children: React.ReactNode }) => {
	const [queryClient] = useState(() => new QueryClient());
	const [trpcClient] = useState(() =>
		api.createClient({ links: createLinks() }),
	);

	return (
		<api.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</api.Provider>
	);
};
