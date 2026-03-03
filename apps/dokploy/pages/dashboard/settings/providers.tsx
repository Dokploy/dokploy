import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ShowCloudProviders } from "@/components/dashboard/settings/cloud-providers/show-cloud-providers";
import { ShowDnsProviders } from "@/components/dashboard/settings/dns-providers/show-dns-providers";
import { ShowDomainProviders } from "@/components/dashboard/settings/domain-providers/show-domain-providers";
import { WildcardDomain } from "@/components/dashboard/settings/wildcard-domain";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";
import { getLocale, serverSideTranslations } from "@/utils/i18n";

const Page = () => {
	return (
		<div className="flex flex-col gap-6 w-full">
			<div>
				<h1 className="text-2xl font-bold mb-2">Providers</h1>
				<p className="text-muted-foreground">
					Manage cloud providers for server provisioning, DNS providers for wildcard SSL certificates, domain providers for unified domain management, and custom wildcard domain settings
				</p>
			</div>

			<div className="space-y-8">
				<WildcardDomain />

				<div>
					<h2 className="text-lg font-semibold mb-4">Cloud Providers</h2>
					<ShowCloudProviders />
				</div>

				<div>
					<h2 className="text-lg font-semibold mb-4">DNS Providers</h2>
					<ShowDnsProviders />
				</div>

				<div>
					<h2 className="text-lg font-semibold mb-4">Domain Providers</h2>
					<ShowDomainProviders />
				</div>
			</div>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Providers">{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const locale = await getLocale(req.cookies);
	const { user, session } = await validateRequest(req);
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
	await helpers.settings.isCloud.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
			...(await serverSideTranslations(locale, ["settings"])),
		},
	};
}