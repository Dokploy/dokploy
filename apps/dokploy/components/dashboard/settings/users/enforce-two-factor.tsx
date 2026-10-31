import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

export const EnforceTwoFactor = () => {
	const { data: activeOrganization, refetch } =
		api.organization.active.useQuery();
	const { mutateAsync, isPending } =
		api.organization.updateEnforceTwoFactor.useMutation();

	const handleToggle = async (checked: boolean) => {
		try {
			await mutateAsync({ enforceTwoFactor: checked });
			await refetch();
			toast.success(
				checked
					? "Two-factor authentication is now required"
					: "Two-factor authentication is no longer required",
			);
		} catch (error) {
			toast.error(
				(error as Error)?.message ||
					"Error updating two-factor authentication requirement",
			);
		}
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<ShieldCheck className="size-6 text-muted-foreground self-center" />
							Security
						</CardTitle>
						<CardDescription>
							Security policies for the members of this organization
						</CardDescription>
					</CardHeader>
					<CardContent className="py-6 border-t">
						<div className="flex items-start justify-between gap-6">
							<div className="space-y-1">
								<Label htmlFor="enforce-two-factor">
									Require two-factor authentication
								</Label>
								<p className="text-sm text-muted-foreground">
									Members who sign in with a password must set up 2FA before
									they can use the dashboard. Members who only sign in through
									SSO are exempt.
								</p>
							</div>
							<Switch
								id="enforce-two-factor"
								checked={!!activeOrganization?.enforceTwoFactor}
								disabled={!activeOrganization || isPending}
								onCheckedChange={handleToggle}
							/>
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
