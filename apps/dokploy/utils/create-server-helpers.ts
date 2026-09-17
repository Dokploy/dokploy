import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import superjson from "superjson";
import type { AppRouter } from "@/server/api/root";

export const generateServerSideHelper = (
	router: AppRouter,
	context: GetServerSidePropsContext<any>,
) => {
	return createServerSideHelpers({
		router,
		ctx: {
			req: context.req as any,
			res: context.res as any,
			db: null as any,
			session: null as any,
			user: null as any,
		},
		transformer: superjson,
	});
};
