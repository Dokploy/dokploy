import { WebDomain } from "@/components/dashboard/settings/web-domain";
import { WebServer } from "@/components/dashboard/settings/web-server";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";
import { getLocale, serverSideTranslations } from "@/utils/i18n";
import { IS_CLOUD, validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";

const Page = () => {
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
	const { user, session } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	if (user.role === "member") {
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
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});
	await helpers.user.get.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
			...(await serverSideTranslations(locale, ["common", "settings"])),
		},
	};
}
