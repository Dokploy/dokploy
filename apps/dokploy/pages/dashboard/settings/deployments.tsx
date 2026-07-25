import { IS_CLOUD, validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { BuildsConcurrency } from "@/components/dashboard/settings/servers/actions/builds-concurrency";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

const Page = () => {
	const { data: servers } = api.server.all.useQuery();

	return (
		<div className="w-full">
			<div className="h-full rounded-xl max-w-5xl mx-auto flex flex-col gap-4">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
					<div className="rounded-xl bg-background shadow-md">
						<CardHeader>
							<CardTitle className="text-xl">Concurrent Builds</CardTitle>
							<CardDescription>
								Configure how many deployments can build at the same time on
								each server. Builds of the same service are always serialized.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-6">
							<AlertBlock type="warning">
								Running multiple builds at once increases CPU, memory and disk
								usage on each server. Each concurrent build runs its own builder
								and image build, so set this based on the resources the machine
								can handle — too high a value can exhaust memory and make
								deployments fail.
							</AlertBlock>
							<div className="flex flex-col gap-2">
								<p className="text-sm font-medium text-muted-foreground">
									Dokploy Server
								</p>
								<BuildsConcurrency />
							</div>

							<div className="flex flex-col gap-2">
								<p className="text-sm font-medium text-muted-foreground">
									Remote Servers
								</p>
								{servers && servers.length > 0 ? (
									<div className="flex flex-col gap-3">
										{servers.map((server) => (
											<BuildsConcurrency
												key={server.serverId}
												serverId={server.serverId}
												label={server.name}
											/>
										))}
									</div>
								) : (
									<p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">
										No remote servers added yet.
									</p>
								)}
							</div>
						</CardContent>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Deployments">{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}
	if (user.role === "member") {
		return {
			redirect: {
				permanent: false,
				destination: "/dashboard/settings/profile",
			},
		};
	}
	// Concurrent builds is a self-hosted feature only.
	if (IS_CLOUD) {
		return {
			redirect: {
				permanent: false,
				destination: "/dashboard/settings/profile",
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
	await helpers.user.get.prefetch();
	await helpers.server.all.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
			isCloud: IS_CLOUD,
		},
	};
}
