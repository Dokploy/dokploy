import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { ShowAuditLogs } from "@/components/proprietary/audit-logs/show-audit-logs";
import { appRouter } from "@/server/api/root";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowAuditLogs />
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout pageTitleKey="auditLogs">{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);

	if (!user) {
		return {
			redirect: { destination: "/", permanent: true },
		};
	}

	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});

	try {
		const userPermissions = await helpers.user.getPermissions.fetch();

		if (!userPermissions?.auditLog.read) {
			return {
				redirect: {
					destination: "/dashboard/settings/profile",
					permanent: false,
				},
			};
		}

		return {
			props: {
				trpcState: helpers.dehydrate(),
			},
		};
	} catch {
		return { props: {} };
	}
}
