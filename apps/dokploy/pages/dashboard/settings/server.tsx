import { SetupMonitoring } from "@/components/dashboard/settings/servers/setup-monitoring";
import { WebDomain } from "@/components/dashboard/settings/web-domain";
import { WebServer } from "@/components/dashboard/settings/web-server";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { getLocale, serverSideTranslations } from "@/utils/i18n";
import { IS_CLOUD, validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { LayoutDashboardIcon } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";
import { toast } from "sonner";
import superjson from "superjson";

const Page = () => {
	const { data, refetch } = api.admin.one.useQuery();
	const { mutateAsync: update } = api.admin.update.useMutation();
	return (
		<div className="w-full">
			<div className="h-full rounded-xl  max-w-5xl mx-auto flex flex-col gap-4">
				<WebDomain />
				<WebServer />
				{/* <Card className="h-full bg-sidebar  p-2.5 rounded-xl ">
					<div className="rounded-xl bg-background shadow-md ">
						<CardHeader className="">
							<CardTitle className="text-xl flex flex-row gap-2">
								<LayoutDashboardIcon className="size-6 text-muted-foreground self-center" />
								Paid Features
							</CardTitle>
							<CardDescription>
								Enable or disable paid features like monitoring
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex flex-row gap-2 items-center">
								<span className="text-sm font-medium text-muted-foreground">
									Enable Paid Features:
								</span>

								<Switch
									checked={data?.enablePaidFeatures}
									onCheckedChange={() => {
										update({
											enablePaidFeatures: !data?.enablePaidFeatures,
										})
											.then(() => {
												toast.success(
													`Paid features ${
														data?.enablePaidFeatures ? "disabled" : "enabled"
													} successfully`,
												);
												refetch();
											})
											.catch(() => {
												toast.error("Error updating paid features");
											});
									}}
								/>
							</div>
						</CardContent>
						{data?.enablePaidFeatures && <SetupMonitoring />}
					</div>
				</Card> */}

				{/* */}
			</div>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Server">{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const locale = await getLocale(req.cookies);
	if (IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/projects",
			},
		};
	}
	const { user, session } = await validateRequest(ctx.req, ctx.res);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	if (user.rol === "user") {
		return {
			redirect: {
				permanent: true,
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
			session: session,
			user: user,
		},
		transformer: superjson,
	});
	await helpers.auth.get.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
			...(await serverSideTranslations(locale, ["settings"])),
		},
	};
}
