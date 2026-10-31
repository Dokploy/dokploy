import { validateRequest } from "@dokploy/server";
import { Fingerprint } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { Enable2FA } from "@/components/dashboard/settings/profile/enable-2fa";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { useWhitelabelingPublic } from "@/utils/hooks/use-whitelabeling";

export default function SetupTwoFactor() {
	const router = useRouter();
	const { config: whitelabeling } = useWhitelabelingPublic();

	return (
		<div className="flex h-screen w-full items-center justify-center">
			<div className="flex flex-col items-center gap-4 w-full">
				<CardTitle className="text-2xl font-bold flex flex-row gap-2 items-center">
					<Logo
						className="size-12"
						logoUrl={
							whitelabeling?.loginLogoUrl || whitelabeling?.logoUrl || undefined
						}
						logoLightUrl={
							whitelabeling?.loginLogoLightUrl ||
							whitelabeling?.logoLightUrl ||
							undefined
						}
					/>
					Two-Factor Authentication
				</CardTitle>
				<CardDescription className="text-center">
					Your organization requires two-factor authentication
				</CardDescription>

				<div className="w-full">
					<CardContent className="p-0 space-y-4">
						<AlertBlock type="info">
							Set up an authenticator app to continue using the dashboard.
						</AlertBlock>
						<Enable2FA
							onSuccess={() => router.push("/dashboard/home")}
							trigger={
								<Button className="w-full">
									<Fingerprint className="size-4" />
									Set up 2FA
								</Button>
							}
						/>
						<Button
							variant="ghost"
							className="w-full"
							onClick={async () => {
								await authClient.signOut();
								router.push("/");
							}}
						>
							Sign out
						</Button>
					</CardContent>
				</div>
			</div>
		</div>
	);
}

SetupTwoFactor.getLayout = (page: ReactElement) => {
	return <OnboardingLayout>{page}</OnboardingLayout>;
};

export async function getServerSideProps(context: GetServerSidePropsContext) {
	const result = await validateRequest(context.req);

	if (result.user) {
		return {
			redirect: { permanent: false, destination: "/dashboard/home" },
		};
	}

	if (!("twoFactorSetupRequired" in result)) {
		return {
			redirect: { permanent: false, destination: "/" },
		};
	}

	return { props: {} };
}
