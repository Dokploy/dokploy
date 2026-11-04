import { IS_CLOUD, validateRequest } from "@dokploy/server";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { OrganizationsDialog } from "@/components/dashboard/settings/ownership/organizations-dialog";
import { OnboardingLayout } from "@/components/layouts/onboarding-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { generateServerSideHelper } from "@/utils/create-server-helpers";
import { useWhitelabelingPublic } from "@/utils/hooks/use-whitelabeling";

export default function OwnershipTransferPage() {
	const router = useRouter();
	const utils = api.useUtils();
	const { config: whitelabeling } = useWhitelabelingPublic();
	const { data: transfer, isLoading } =
		api.ownershipTransfer.incoming.useQuery();
	const { mutateAsync: acceptTransfer, isPending: isAccepting } =
		api.ownershipTransfer.accept.useMutation();
	const { mutateAsync: declineTransfer, isPending: isDeclining } =
		api.ownershipTransfer.decline.useMutation();

	return (
		<div className="flex min-h-screen w-full items-center justify-center py-10">
			<div className="flex flex-col items-center gap-4 w-full max-w-md px-4">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<Link href="/" className="flex flex-row items-center gap-2">
						<Logo
							className="size-12"
							logoUrl={
								whitelabeling?.loginLogoUrl ||
								whitelabeling?.logoUrl ||
								undefined
							}
							logoLightUrl={
								whitelabeling?.loginLogoLightUrl ||
								whitelabeling?.logoLightUrl ||
								undefined
							}
						/>
					</Link>
					Ownership Transfer
				</CardTitle>

				{isLoading ? (
					<CardDescription>Loading ownership transfer...</CardDescription>
				) : !transfer ? (
					<div className="flex flex-col gap-4 w-full">
						<AlertBlock type="info">
							You don't have a pending ownership transfer.
						</AlertBlock>
						<Button asChild className="w-full">
							<Link href="/dashboard/home">Go to Dashboard</Link>
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-4 w-full">
						<CardDescription>
							<strong className="break-words">{transfer.fromUser.email}</strong>{" "}
							wants to make you the owner of this Dokploy instance
							{transfer.organizations.length === 0
								? "."
								: transfer.organizations.length === 1
									? " and its organization. They will stay in it as a member."
									: ` and all ${transfer.organizations.length} of its organizations. They will stay in them as a member.`}{" "}
							<OrganizationsDialog organizations={transfer.organizations} />
						</CardDescription>
						<CardDescription>
							Expires on {new Date(transfer.expiresAt).toLocaleString()}.
						</CardDescription>

						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<DialogAction
								title="Decline Ownership Transfer"
								description="The current owner will keep ownership of the instance."
								type="destructive"
								onClick={async () => {
									await declineTransfer()
										.then(async () => {
											toast.success("Ownership transfer declined");
											await utils.ownershipTransfer.invalidate();
											router.push("/dashboard/home");
										})
										.catch((err) => {
											toast.error(
												err?.message || "Error declining ownership transfer",
											);
										});
								}}
							>
								<Button
									className="w-full sm:w-auto"
									variant="secondary"
									isLoading={isDeclining}
								>
									Decline
								</Button>
							</DialogAction>
							<DialogAction
								title="Accept Ownership Transfer"
								description="You will become the owner of this instance and of every organization listed."
								type="default"
								onClick={async () => {
									await acceptTransfer()
										.then(async () => {
											toast.success("You are now the owner of this instance");
											await utils.invalidate();
											router.push("/dashboard/home");
										})
										.catch((err) => {
											toast.error(
												err?.message || "Error accepting ownership transfer",
											);
										});
								}}
							>
								<Button className="w-full sm:w-auto" isLoading={isAccepting}>
									Accept Ownership
								</Button>
							</DialogAction>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

OwnershipTransferPage.getLayout = (page: ReactElement) => {
	return <OnboardingLayout>{page}</OnboardingLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { user } = await validateRequest(ctx.req);

	if (IS_CLOUD || !user) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}

	const helpers = generateServerSideHelper(appRouter, ctx);
	await helpers.whitelabeling.getPublic.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
		},
	};
}
