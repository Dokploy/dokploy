import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

export const API_KEY_2FA_WARNING =
	"Affected members are blocked until they enable 2FA, and their API keys stop working until then.";

export const Require2FA = () => {
	const utils = api.useUtils();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const { data: activeOrganization } = api.organization.active.useQuery();
	const { data: currentUser } = api.user.get.useQuery();
	const { data: hasPassword } = api.user.hasPassword.useQuery();
	const {
		data: impact,
		isPending: isImpactPending,
		isError: isImpactError,
	} = api.organization.require2FAImpact.useQuery(undefined, {
		enabled: confirmOpen,
	});
	const { mutateAsync, isPending } =
		api.organization.setRequire2FA.useMutation();

	const enabled = !!activeOrganization?.require2FA;
	const isOwner = currentUser?.role === "owner";
	const ownerIsPending =
		isOwner && !!hasPassword && !currentUser?.user.twoFactorEnabled;
	const cannotEnable = !enabled && ownerIsPending;

	const save = async (value: boolean) => {
		try {
			await mutateAsync({ enabled: value });
			toast.success(
				value
					? "Two-factor authentication is now required"
					: "Two-factor authentication is no longer required",
			);
			setConfirmOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update setting",
			);
		} finally {
			await Promise.all([
				utils.organization.active.invalidate(),
				utils.user.all.invalidate(),
			]);
		}
	};

	const toggle = (
		<Switch
			id="require-2fa"
			checked={enabled}
			disabled={!isOwner || cannotEnable || isPending}
			onCheckedChange={(checked) => {
				if (checked) {
					setConfirmOpen(true);
				} else {
					void save(false);
				}
			}}
		/>
	);

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
						<div className="space-y-1.5">
							<CardTitle className="text-xl flex flex-row gap-2">
								<ShieldCheck className="size-6 text-muted-foreground self-center" />
								<Label htmlFor="require-2fa" className="text-xl">
									Require two-factor authentication for all members
								</Label>
							</CardTitle>
							<CardDescription>
								Members who have a password must enable 2FA before they can use
								Dokploy. Members who only sign in with GitHub, Google, or SSO
								are not affected.
								{!isOwner && " Only the organization owner can change this."}
							</CardDescription>
						</div>
						{cannotEnable ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<span>{toggle}</span>
								</TooltipTrigger>
								<TooltipContent>
									Enable two-factor authentication on your own account first.
								</TooltipContent>
							</Tooltip>
						) : (
							toggle
						)}
					</CardHeader>
				</div>
			</Card>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Require two-factor authentication?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-2">
								<p>
									{isImpactError
										? "Couldn't check which members are affected. Close this dialog and try again."
										: isImpactPending
											? "Checking which members are affected..."
											: impact.affectedMembers === 1
												? "1 member has a password and hasn't enabled 2FA yet."
												: `${impact.affectedMembers} members have a password and haven't enabled 2FA yet.`}
								</p>
								<p>{API_KEY_2FA_WARNING}</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={isPending || isImpactPending || isImpactError}
							onClick={(e) => {
								e.preventDefault();
								void save(true);
							}}
						>
							Require 2FA
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
};
