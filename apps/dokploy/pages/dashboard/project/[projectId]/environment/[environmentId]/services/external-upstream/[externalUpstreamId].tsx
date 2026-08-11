import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import copy from "copy-to-clipboard";
import { GlobeIcon } from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { type ReactElement, useEffect, useState } from "react";
import { toast } from "sonner";
import superjson from "superjson";
import { ShowDomains } from "@/components/dashboard/application/domains/show-domains";
import { DeleteService } from "@/components/dashboard/compose/delete-service";
import { UpdateExternalUpstream } from "@/components/dashboard/external-upstream/update-external-upstream";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AdvanceBreadcrumb } from "@/components/shared/advance-breadcrumb";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type TabState = "general" | "domains";

const Service = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const { externalUpstreamId, activeTab } = props;
	const router = useRouter();
	const { projectId, environmentId } = router.query;
	const [tab, setTab] = useState<TabState>(activeTab);

	useEffect(() => {
		if (router.query.tab) {
			setTab(router.query.tab as TabState);
		}
	}, [router.query.tab]);

	const { data } = api.externalUpstream.one.useQuery({
		externalUpstreamId,
	});
	const { data: serverIp } = api.settings.getIp.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();

	return (
		<div className="pb-10">
			<AdvanceBreadcrumb />
			<Head>
				<title>
					External Upstream: {data?.name} - {data?.environment.project.name}
				</title>
			</Head>
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl w-full">
					<div className="rounded-xl bg-background shadow-md">
						<CardHeader className="flex flex-row justify-between items-center">
							<div className="flex flex-col">
								<CardTitle className="text-xl flex flex-row gap-2 items-center">
									<div className="relative flex flex-row gap-4 items-center">
										<GlobeIcon className="size-6 text-muted-foreground" />
										<div className="absolute -right-1 -top-2 z-10">
											<StatusTooltip status={data?.applicationStatus} />
										</div>
									</div>
									{data?.name}
								</CardTitle>
								{data?.description && (
									<CardDescription>{data.description}</CardDescription>
								)}
								<span className="text-sm text-muted-foreground">
									{data?.appName}
								</span>
							</div>
							<div className="flex flex-col h-fit w-fit gap-2">
								<Badge
									className="cursor-pointer"
									onClick={() => {
										const ip = data?.server?.ipAddress || serverIp;
										if (ip) {
											copy(ip);
											toast.success("IP Address copied");
										}
									}}
								>
									{data?.server?.name || "Dokploy Server"}
								</Badge>
								<div className="flex flex-row gap-2 justify-end">
									{permissions?.service.create && (
										<UpdateExternalUpstream
											externalUpstreamId={externalUpstreamId}
										/>
									)}
									{permissions?.service.delete && (
										<DeleteService
											id={externalUpstreamId}
											type="external-upstream"
										/>
									)}
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-2 py-8 border-t">
							<Tabs
								value={tab}
								defaultValue="general"
								className="w-full"
								onValueChange={(value) => {
									setTab(value as TabState);
									void router.push(
										`/dashboard/project/${projectId}/environment/${environmentId}/services/external-upstream/${externalUpstreamId}?tab=${value}`,
									);
								}}
							>
								<TabsList className="flex gap-8 justify-start">
									<TabsTrigger value="general">General</TabsTrigger>
									{permissions?.domain.read && (
										<TabsTrigger value="domains">Domains</TabsTrigger>
									)}
								</TabsList>
								<TabsContent value="general" className="pt-6">
									<div className="grid gap-4 md:grid-cols-2">
										<Card>
											<CardHeader>
												<CardTitle className="text-base">Upstream</CardTitle>
											</CardHeader>
											<CardContent className="space-y-3">
												<div>
													<p className="text-sm text-muted-foreground">
														Target URL
													</p>
													<p className="font-mono text-sm break-all">
														{data?.targetUrl}
													</p>
												</div>
												<div>
													<p className="text-sm text-muted-foreground">
														Pass Host Header
													</p>
													<p>{data?.passHostHeader ? "Enabled" : "Disabled"}</p>
												</div>
											</CardContent>
										</Card>
									</div>
								</TabsContent>
								<TabsContent value="domains" className="pt-6">
									<ShowDomains
										id={externalUpstreamId}
										type="externalUpstream"
									/>
								</TabsContent>
							</Tabs>
						</CardContent>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default Service;
Service.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{
		externalUpstreamId: string;
		activeTab: TabState;
		environmentId: string;
	}>,
) {
	const { query, params, req, res } = ctx;
	const activeTab = query.tab;
	const { user, session } = await validateRequest(req);
	if (!user) {
		return {
			redirect: {
				permanent: false,
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

	if (typeof params?.externalUpstreamId === "string") {
		try {
			await helpers.externalUpstream.one.fetch({
				externalUpstreamId: params.externalUpstreamId,
			});
			return {
				props: {
					trpcState: helpers.dehydrate(),
					externalUpstreamId: params.externalUpstreamId,
					activeTab: (activeTab || "general") as TabState,
					environmentId: params.environmentId,
				},
			};
		} catch {
			return {
				redirect: {
					permanent: false,
					destination: "/dashboard/home",
				},
			};
		}
	}

	return {
		redirect: {
			permanent: false,
			destination: "/",
		},
	};
}
