import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import type { ReactElement } from "react";
import superjson from "superjson";
import { CreateNetwork } from "@/components/dashboard/network/create-network";
import { NetworkList } from "@/components/dashboard/network/network-list";
import { SyncNetworks } from "@/components/dashboard/network/sync-networks";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { appRouter } from "@/server/api/root";

const NetworksPage = (
	_props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	return (
		<div className="pb-10">
			<BreadcrumbSidebar
				list={[
					{ name: "Dashboard", href: "/dashboard/projects" },
					{ name: "Networks" },
				]}
			/>
			<Head>
				<title>Networks | Dokploy</title>
			</Head>
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl">
					<div className="rounded-xl bg-background shadow-md space-y-4">
						<Card className="bg-background">
							<CardHeader className="p-4 sm:p-6">
								<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
									<div className="space-y-1 flex-1">
										<CardTitle>Custom Networks</CardTitle>
										<CardDescription>
											Manage Docker networks for service isolation and
											communication control across your organization
										</CardDescription>
									</div>
									<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 flex-shrink-0">
										<SyncNetworks />
										<CreateNetwork />
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<NetworkList />
							</CardContent>
						</Card>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default NetworksPage;
NetworksPage.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);
	if (!user) {
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
			req,
			res,
			db: null,
			session,
			user,
		},
		transformer: superjson,
	});

	try {
		await helpers.network.all.prefetch();

		return {
			props: {
				trpcState: helpers.dehydrate(),
			},
		};
	} catch {
		return {
			redirect: {
				permanent: false,
				destination: "/dashboard/projects",
			},
		};
	}
}
