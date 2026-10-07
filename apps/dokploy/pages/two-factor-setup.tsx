import { validateRequest } from "@dokploy/server";
import { LogOut, ShieldAlert } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { Enable2FA } from "@/components/dashboard/settings/profile/enable-2fa";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { requiresTwoFactor } from "@/lib/two-factor";
import { api } from "@/utils/api";

const TwoFactorSetup = () => {
	const router = useRouter();
	const { data: organizations } = api.organization.all.useQuery();

	const requiringOrganizations =
		organizations?.filter(requiresTwoFactor).map((org) => org.name) ?? [];

	return (
		<div className="flex h-screen w-full items-center justify-center">
			<div className="flex w-full max-w-md flex-col gap-6">
				<div className="flex flex-col gap-2">
					<CardTitle className="flex items-center gap-2 text-2xl font-bold">
						<ShieldAlert className="size-6" />
						Set up two-factor authentication
					</CardTitle>
					<CardDescription>
						{requiringOrganizations.length > 0
							? requiringOrganizations.join(", ")
							: "One of your organizations"}{" "}
						requires two-factor authentication for members who have a password.
						Enable it to continue using Dokploy.
					</CardDescription>
				</div>

				<Enable2FA
					onEnabled={() => {
						// A full load so no cached session still flags the setup as pending.
						window.location.href = "/dashboard/projects";
					}}
				/>

				<Button
					variant="ghost"
					onClick={async () => {
						await authClient.signOut();
						router.push("/");
					}}
				>
					<LogOut className="size-4" />
					Sign out
				</Button>
			</div>
		</div>
	);
};

export default TwoFactorSetup;

TwoFactorSetup.getLayout = (page: ReactElement) => {
	return <OnboardingLayout>{page}</OnboardingLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { user } = await validateRequest(ctx.req, { allowPending: true });

	if (!user) {
		return { redirect: { permanent: false, destination: "/" } };
	}

	if (!user.twoFactorSetupRequired) {
		return {
			redirect: { permanent: false, destination: "/dashboard/projects" },
		};
	}

	return { props: {} };
}
