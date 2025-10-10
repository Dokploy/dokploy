import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { Network } from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import type { ReactElement } from "react";
import superjson from "superjson";
import { CreateNetwork } from "@/components/dashboard/network/create-network";
import { NetworkList } from "@/components/dashboard/network/network-list";
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
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between">
									<div>
										<CardTitle>Custom Networks</CardTitle>
										<CardDescription>
											Manage Docker networks for service isolation and
											communication control across your organization
										</CardDescription>
									</div>
									<CreateNetwork />
								</div>
							</CardHeader>
							<CardContent>
								<NetworkList />
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Network Isolation Benefits</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								<div className="flex items-start gap-3">
									<Network className="mt-0.5 h-5 w-5 text-muted-foreground" />
									<div>
										<div className="font-medium">Security Isolation</div>
										<p className="text-sm text-muted-foreground">
											Services can only communicate if they're on the same
											network, preventing unauthorized access
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<Network className="mt-0.5 h-5 w-5 text-muted-foreground" />
									<div>
										<div className="font-medium">Multi-Tenancy</div>
										<p className="text-sm text-muted-foreground">
											Isolate different projects or clients on separate networks
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<Network className="mt-0.5 h-5 w-5 text-muted-foreground" />
									<div>
										<div className="font-medium">Organization-Wide Access</div>
										<p className="text-sm text-muted-foreground">
											Networks are available across all projects in your
											organization, enabling flexible resource sharing
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<Network className="mt-0.5 h-5 w-5 text-muted-foreground" />
									<div>
										<div className="font-medium">Traefik Integration</div>
										<p className="text-sm text-muted-foreground">
											Traefik automatically connects to your networks to route
											traffic without exposing services globally
										</p>
									</div>
								</div>
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
			req: req as any,
			res: res as any,
			db: null as any,
			session: session as any,
			user: user as any,
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
