import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import type { EnabledSocialProviders } from "@/components/auth/social-login";
import { ShowApiKeys } from "@/components/dashboard/settings/api/show-api-keys";
import { LinkingAccount } from "@/components/dashboard/settings/linking-account/linking-account";
import { ProfileForm } from "@/components/dashboard/settings/profile/profile-form";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

const Page = ({
	socialProviders = {},
}: {
	socialProviders?: EnabledSocialProviders;
}) => {
	const { data: permissions } = api.user.getPermissions.useQuery();
	const hasSocialProvider = socialProviders.github || socialProviders.google;

	return (
		<div className="w-full">
			<div className="h-full rounded-xl w-full flex flex-col gap-4">
				<ProfileForm />
				{hasSocialProvider && <LinkingAccount providers={socialProviders} />}
				{permissions?.api.read && <ShowApiKeys />}
			</div>
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Profile">{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);

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

	if (!user) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}

	return {
		props: {
			trpcState: helpers.dehydrate(),
			socialProviders: {
				github: Boolean(
					process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
				),
				google: Boolean(
					process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
				),
			},
		},
	};
}
