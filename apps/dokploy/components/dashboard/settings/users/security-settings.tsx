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

export const SecuritySettings = () => {
	const { data: organization, refetch } = api.organization.active.useQuery();
	const { mutateAsync, isPending } =
		api.organization.updateSensitiveActionVerification.useMutation();

	const handleToggle = async (enabled: boolean) => {
		try {
			await mutateAsync({ enabled });
			await refetch();
			toast.success(
				enabled
					? "Identity verification enabled"
					: "Identity verification disabled",
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Error updating identity verification",
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
							Security settings for this organization.
						</CardDescription>
					</CardHeader>
					<CardContent className="py-6 border-t">
						<div className="flex items-start justify-between gap-6">
							<div className="flex flex-col gap-1">
								<Label htmlFor="sensitive-action-verification">
									Require identity verification for sensitive actions
								</Label>
								<p className="text-sm text-muted-foreground">
									Members must confirm their identity (password, passkey or
									signing in again) before deleting resources or changing
									access. Verification lasts 5 minutes. API keys are not
									affected.
								</p>
							</div>
							<Switch
								id="sensitive-action-verification"
								checked={!!organization?.requireSensitiveActionVerification}
								onCheckedChange={handleToggle}
								disabled={isPending || !organization}
							/>
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
