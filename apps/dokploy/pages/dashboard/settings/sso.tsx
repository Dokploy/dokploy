import { IS_CLOUD, validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
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
	return (
		<div className="w-full">
			<div className="h-full rounded-xl max-w-5xl mx-auto flex flex-col gap-4">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
					<div className="rounded-xl bg-background shadow-md">
						<div className="p-6">
							<EnterpriseFeatureGate
								lockedProps={{
									title: "Enterprise SSO",
									description:
										"Single sign-on (SSO) with OIDC and SAML is part of Dokploy Enterprise. Add a valid license to configure it.",
									ctaLabel: "Go to License",
								}}
							>
								<SSOSettings />
							</EnterpriseFeatureGate>
						</div>
					</div>
				</Card>
				<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
					<div className="rounded-xl bg-background shadow-md">
						<EnterpriseFeatureGate
							lockedProps={{
								title: "Application Authentication",
								description:
									"Protect deployed applications behind an OIDC SSO gate (oauth2-proxy). Part of Dokploy Enterprise.",
								ctaLabel: "Go to License",
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
									title: "Self-hosted Restrictions",
									description:
										"Deployment and authentication restrictions are part of Dokploy Enterprise. Add a valid license to configure them.",
									ctaLabel: "Go to License",
								}}
							>
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
