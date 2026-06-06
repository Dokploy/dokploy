import { IS_CLOUD, validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ToggleEnforceSSO } from "@/components/dashboard/settings/servers/actions/toggle-enforce-sso";
import { ToggleRemoteServersOnly } from "@/components/dashboard/settings/servers/actions/toggle-remote-servers-only";
import { SSOSettings } from "@/components/dashboard/sso/sso-settings";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { appRouter } from "@/server/api/root";

interface Props {
	isCloud: boolean;
}

const Page = ({ isCloud }: Props) => {
	return (
		<div className="w-full">
			<div className="h-full rounded-xl max-w-5xl mx-auto flex flex-col gap-4">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
					<div className="rounded-xl bg-background shadow-md">
						<div className="p-6">
							<SSOSettings />
						</div>
					</div>
				</Card>
				{!isCloud && (
					<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
						<div className="rounded-xl bg-background shadow-md">
							<CardHeader>
								<CardTitle className="text-xl">
									Self-hosted Restrictions
								</CardTitle>
								<CardDescription>
									Control deployment targets and authentication behavior.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								<ToggleRemoteServersOnly />
								<ToggleEnforceSSO />
							</CardContent>
						</div>
					</Card>
				)}
			</div>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="SSO">{page}</DashboardLayout>;
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
			isCloud: IS_CLOUD,
		},
	};
}
