import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ShowCloudProviders } from "@/components/dashboard/settings/cloud-providers/show-cloud-providers";
import { ShowSidebarConfig } from "@/components/dashboard/settings/configuration/show-sidebar-config";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";

const Page = () => {
	return (
		<div className="flex w-full flex-col gap-6">
			<div>
				<h1 className="text-2xl font-bold mb-2">Configuration</h1>
				<p className="text-muted-foreground">
					Manage organization-wide settings, sidebar visibility, and cloud
					provider credentials from one place.
				</p>
			</div>

			<div className="grid gap-6">
				<ShowSidebarConfig />

				<section id="cloud-providers" className="scroll-mt-24">
					<ShowCloudProviders />
				</section>
			</div>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Configuration">{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);

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

	await helpers.userPreferences.get.prefetch();

	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	return {
		props: {
			trpcState: helpers.dehydrate(),
		},
	};
}
