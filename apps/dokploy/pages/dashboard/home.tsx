import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import superjson from "superjson";
import { ShowHome } from "@/components/dashboard/home/show-home";
import { CloudOnboarding } from "@/components/dashboard/onboarding/cloud/cloud-onboarding";
import {
	clearOnboardingActive,
	isOnboardingActive,
	markOnboardingActive,
} from "@/components/dashboard/onboarding/onboarding-lock";
import { OnboardingWizard } from "@/components/dashboard/onboarding/onboarding-wizard";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { isOnboardingScreen } from "@/lib/onboarding";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

const Home = () => {
	const router = useRouter();
	const { data } = api.project.onboardingStatus.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canCreateServers = !!permissions?.server.create;
	const { data: servers } = api.server.withSSHKey.useQuery(undefined, {
		enabled: isCloud === true,
	});
	const needsServer =
		isCloud === true && canCreateServers && servers?.length === 0;
	const utils = api.useUtils();
	const { mutateAsync: completeOnboarding } =
		api.project.completeOnboarding.useMutation();
	const [showWizard, setShowWizard] = useState<boolean | null>(null);
	const [wizardStep, setWizardStep] = useState<string | null>(null);

	useEffect(() => {
		if (showWizard === null && data) {
			const show = isOnboardingActive() || data.shouldShowOnboarding;
			setShowWizard(show);
			if (show) markOnboardingActive();
		}
	}, [data, showWizard]);

	// Email links land here with ?onboarding=connect|resume to reopen the setup.
	const linkedStep =
		typeof router.query.onboarding === "string"
			? router.query.onboarding
			: null;
	useEffect(() => {
		if (!linkedStep || !needsServer || !data) return;
		setWizardStep(
			isOnboardingScreen(linkedStep)
				? linkedStep
				: (data.onboardingStep ?? "path"),
		);
		setShowWizard(true);
		router.replace("/dashboard/home", undefined, { shallow: true });
	}, [linkedStep, needsServer, data]);

	const closeWizard = async () => {
		await completeOnboarding();
		await utils.project.onboardingStatus.invalidate();
		clearOnboardingActive();
		setWizardStep(null);
		setShowWizard(false);
	};

	if (showWizard && isCloud) {
		return (
			<CloudOnboarding
				key={wizardStep ?? "saved"}
				initialStep={wizardStep ?? data?.onboardingStep}
				onClose={closeWizard}
			/>
		);
	}

	if (showWizard) {
		return <OnboardingWizard onClose={closeWizard} />;
	}

	return <ShowHome />;
};

export default Home;

Home.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req, res } = ctx;
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

	await helpers.settings.isCloud.prefetch();
	await helpers.user.get.prefetch();
	await helpers.project.onboardingStatus.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
		},
	};
}
