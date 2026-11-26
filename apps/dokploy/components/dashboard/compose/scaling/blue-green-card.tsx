import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { readableErrorMessage } from "@/utils/error-message";

export const ComposeBlueGreenCard = ({ composeId }: { composeId: string }) => {
	const utils = api.useUtils();
	const { data: compose } = api.compose.one.useQuery({ composeId });
	const { mutateAsync, isPending } = api.compose.update.useMutation();

	if (!compose) return null;

	const toggle = async (blueGreenEnabled: boolean) => {
		try {
			await mutateAsync({ composeId, blueGreenEnabled });
			await utils.compose.one.invalidate({ composeId });
			toast.success(
				blueGreenEnabled
					? "Blue/green deployments enabled"
					: "Blue/green deployments disabled",
			);
		} catch (error) {
			toast.error(
				readableErrorMessage(error, "Error saving blue/green deployments"),
			);
		}
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<CardTitle className="text-xl">Blue/green deployments</CardTitle>
					<CardDescription>
						A deploy starts the new version as a second stack next to the
						running one, moves the domains to it once every replica is
						healthy, updates the running stack, then removes the second one.
						If the new version never becomes healthy, the running one keeps
						serving.
					</CardDescription>
				</div>
				<Switch
					checked={compose.blueGreenEnabled}
					onCheckedChange={toggle}
					disabled={isPending}
				/>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<AlertBlock type="info">
					Only for stacks whose services use no volumes, publish no ports and
					run replicated, with at least one domain. Otherwise a deploy is a
					normal rolling update, and the deployment log says why. Two copies of
					every service run during a deploy.
				</AlertBlock>
			</CardContent>
		</Card>
	);
};
