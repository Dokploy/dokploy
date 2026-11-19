import { IS_CLOUD, validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import superjson from "superjson";
import { ToggleEnforceSSO } from "@/components/dashboard/settings/servers/actions/toggle-enforce-sso";
import { ToggleRemoteServersOnly } from "@/components/dashboard/settings/servers/actions/toggle-remote-servers-only";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { EnterpriseFeatureGate } from "@/components/proprietary/enterprise-feature-gate";
import { ForwardAuthServers } from "@/components/proprietary/sso/forward-auth-servers";
import { SSOSettings } from "@/components/proprietary/sso/sso-settings";
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
	const { t } = useTranslation();
	return (
		<div className="w-full">
			<div className="h-full rounded-xl max-w-5xl mx-auto flex flex-col gap-4">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
					<div className="rounded-xl bg-background shadow-md">
						<EnterpriseFeatureGate
							lockedProps={{
								title: t("sso.lockedTitle"),
								description: t("sso.lockedDescription"),
								ctaLabel: t("sso.goToLicense"),
							}}
						>
							<SSOSettings />
						</EnterpriseFeatureGate>
					</div>
				</Card>
				<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
					<div className="rounded-xl bg-background shadow-md">
						<EnterpriseFeatureGate
							lockedProps={{
								title: t("sso.appAuthTitle"),
								description: t("sso.appAuthDescription"),
								ctaLabel: t("sso.goToLicense"),
							}}
						>
							<ForwardAuthServers />
						</EnterpriseFeatureGate>
					</div>
				</Card>
				{!isCloud && (
					<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
						<div className="rounded-xl bg-background shadow-md">
							<EnterpriseFeatureGate
								lockedProps={{
									title: t("sso.restrictionsTitle"),
									description: t("sso.restrictionsLockedDescription"),
									ctaLabel: t("sso.goToLicense"),
								}}
							>
								<CardHeader>
									<CardTitle className="text-xl">
										{t("sso.restrictionsTitle")}
									</CardTitle>
									<CardDescription>
										{t("sso.restrictionsDescription")}
									</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-4">
									<ToggleRemoteServersOnly />
									<ToggleEnforceSSO />
								</CardContent>
							</EnterpriseFeatureGate>
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
