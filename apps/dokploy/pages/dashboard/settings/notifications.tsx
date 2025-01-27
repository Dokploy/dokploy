import { ShowNotifications } from "@/components/dashboard/settings/notifications/show-notifications";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";

import { appRouter } from "@/server/api/root";
import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";
import superjson from "superjson";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowNotifications />
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Notifications">{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req, res);
	if (!user || user.rol === "user") {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session,
			user: user,
		},
		transformer: superjson,
	});
	await helpers.auth.get.prefetch();
	await helpers.settings.isCloud.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
		},
	};
}
