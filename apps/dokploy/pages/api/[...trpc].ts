import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { validateBearerToken, validateRequest } from "@dokploy/server";
import { createOpenApiNextHandler } from "@dokploy/trpc-openapi";
import type { NextApiRequest, NextApiResponse } from "next";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
	let { session, user } = await validateBearerToken(req);

	if (!session) {
		const cookieResult = await validateRequest(req, res);
		session = cookieResult.session;
		user = cookieResult.user;
	}

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
