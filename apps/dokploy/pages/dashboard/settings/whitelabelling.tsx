import { IS_CLOUD, validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { WhitelabelForm } from "@/components/dashboard/settings/whitelabelling/whitelabel-form";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { EnterpriseFeatureGate } from "@/components/proprietary/enterprise-feature-gate";
import { Card } from "@/components/ui/card";
import { appRouter } from "@/server/api/root";
import { getLocale, serverSideTranslations } from "@/utils/i18n";

const Page = () => {
	return (
		<div className="w-full">
			<div className="h-full rounded-xl max-w-5xl mx-auto flex flex-col gap-4">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
					<div className="rounded-xl bg-background shadow-md">
						<div className="p-6">
							<EnterpriseFeatureGate
								lockedProps={{
									title: "Whitelabelling",
									description:
										"Customise app name and logos (whitelabelling) is part of Dokploy Enterprise. Add a valid license to use it.",
									ctaLabel: "Go to License",
								}}
							>
								<WhitelabelForm />
							</EnterpriseFeatureGate>
						</div>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => (
	<DashboardLayout metaName="Whitelabelling">{page}</DashboardLayout>
);

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<Record<string, string>>,
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

	const { user } = await validateRequest(req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	if (user.role !== "owner" && user.role !== "admin") {
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
			session: null as any,
			user: user as any,
		},
		transformer: superjson,
	});
	await helpers.whitelabel.get.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
			...(await serverSideTranslations(locale, ["settings"])),
		},
	};
}
