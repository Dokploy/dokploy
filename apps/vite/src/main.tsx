import "./styles/globals.css";

import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import { setRouterInstance } from "./shims/next-router";
import { TRPCProvider } from "./utils/trpc-provider";

const router = createRouter({ routeTree });

setRouterInstance(router);

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("root");

if (rootElement && !rootElement.innerHTML) {
	ReactDOM.createRoot(rootElement).render(
		<TRPCProvider>
			<RouterProvider router={router} />
		</TRPCProvider>,
	);
}
