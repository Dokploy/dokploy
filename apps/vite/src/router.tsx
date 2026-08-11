import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { setRouterInstance } from "./shims/next-router";
import { TRPCProvider } from "./utils/trpc-provider";

export function getRouter() {
	const router = createRouter({
		routeTree,
		defaultPreload: "intent",
		Wrap: ({ children }) => <TRPCProvider>{children}</TRPCProvider>,
	});

	if (typeof window !== "undefined") {
		setRouterInstance(router);
	}

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
