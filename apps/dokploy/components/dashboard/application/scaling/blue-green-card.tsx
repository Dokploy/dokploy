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

export const BlueGreenCard = ({ applicationId }: { applicationId: string }) => {
	const utils = api.useUtils();
	const { data: application } = api.application.one.useQuery({
		applicationId,
	});
	const { mutateAsync, isPending } = api.application.update.useMutation();

	if (!application) return null;

	const publishesPorts =
		application.ports.length > 0 ||
		(application.endpointSpecSwarm?.Ports?.length ?? 0) > 0;

	const toggle = async (blueGreenEnabled: boolean) => {
		try {
			await mutateAsync({ applicationId, blueGreenEnabled });
			await utils.application.one.invalidate({ applicationId });
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
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<CardTitle className="text-xl">Blue/green deployments</CardTitle>
					<CardDescription>
						A deploy starts the new version next to the running one, switches
						traffic to it once every replica is healthy, then removes the old
						version. If the new version never becomes healthy, traffic stays
						on the old one.
					</CardDescription>
				</div>
				<Switch
					checked={application.blueGreenEnabled}
					onCheckedChange={toggle}
					disabled={isPending || (publishesPorts && !application.blueGreenEnabled)}
				/>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{publishesPorts && (
					<AlertBlock type="warning">
						This application publishes ports. Two copies can't bind the same
						port, so deploys use a normal rolling update until the ports are
						removed.
					</AlertBlock>
				)}
				{application.blueGreenEnabled && !application.healthCheckSwarm && (
					<AlertBlock type="warning">
						No health check is set. Traffic switches as soon as the containers
						are running, whether or not the application is ready. Add a health
						check in Advanced → Cluster Settings.
					</AlertBlock>
				)}
				<p className="text-sm text-muted-foreground">
					During a deploy the application needs resources for two copies. The
					first deploy, and a stopped application, deploy normally. A fast
					rollback is a redeploy of the previous version from the Rollbacks
					tab.
				</p>
			</CardContent>
		</Card>
	);
};
