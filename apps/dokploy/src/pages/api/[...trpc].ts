import { validateRequest } from "@dokploy/server";
import { createOpenApiNextHandler } from "@dokploy/trpc-openapi";
import type { NextApiRequest, NextApiResponse } from "next";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
	const { session, user } = await validateRequest(req);

	if (!user || !session) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	// @ts-ignore
	return createOpenApiNextHandler({
		router: appRouter,
		createContext: createTRPCContext,
	})(req, res);
};

export default handler;
