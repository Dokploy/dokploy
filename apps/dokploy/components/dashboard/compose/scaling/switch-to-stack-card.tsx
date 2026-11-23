import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { readableErrorMessage } from "@/utils/error-message";

/**
 * Plain Docker Compose runs on one host; the way to several VMs is running
 * the same file as a Swarm stack. Lists what changes, then switches.
 */
export const SwitchToStackCard = ({
	composeId,
	canSwitch,
}: {
	composeId: string;
	canSwitch: boolean;
}) => {
	const utils = api.useUtils();
	const { data, isLoading } = api.scaling.composeStackCheck.useQuery({
		composeId,
	});
	const { mutateAsync, isPending } =
		api.scaling.switchComposeToStack.useMutation();
	const issues = data?.issues ?? [];
	const blocking = issues.filter((issue) => issue.severity === "blocking");
	const warnings = issues.filter((issue) => issue.severity === "warning");

	const switchNow = async () => {
		await mutateAsync({ composeId, acknowledgeWarnings: true })
			.then(() =>
				toast.success("Switched to Stack. The first stack deploy is queued."),
			)
			.catch((error) =>
				toast.error(readableErrorMessage(error, "Could not switch to Stack")),
			);
		await Promise.all([
			utils.scaling.composeStatus.invalidate({ composeId }),
			utils.scaling.composeStackCheck.invalidate({ composeId }),
			utils.compose.one.invalidate({ composeId }),
		]);
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Run on several machines</CardTitle>
				<CardDescription>
					Docker Compose runs every container on this server. Deployed as a
					Stack, the same file runs as Swarm services, so replicas can spread
					over the swarm's VMs and load balancing spans all of them.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isLoading && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Checking the compose file…
					</div>
				)}
				{data && !data.readable && (
					<AlertBlock type="info">
						Dokploy cannot read this compose file yet. Deploy it once to check
						whether it can run as a Stack.
					</AlertBlock>
				)}
				{data?.readable && issues.length === 0 && (
					<AlertBlock type="success">
						Nothing in this file changes behaviour as a Stack.
					</AlertBlock>
				)}
				{issues.length > 0 && (
					<ul className="flex flex-col gap-2">
						{[...blocking, ...warnings].map((issue) => (
							<li
								key={`${issue.serviceName}-${issue.message}`}
								className="flex items-start gap-3 rounded-md border p-3 text-sm"
							>
								<Badge
									variant={issue.severity === "blocking" ? "red" : "yellow"}
								>
									{issue.severity === "blocking" ? "Must fix" : "Changes"}
								</Badge>
								<div>
									<span className="font-mono">{issue.serviceName}</span>
									<p className="text-muted-foreground">{issue.message}</p>
								</div>
							</li>
						))}
					</ul>
				)}
				{canSwitch && data?.readable && (
					<DialogAction
						title="Switch this compose to Stack?"
						description={
							<>
								<span className="block">
									Dokploy stops and removes the running containers (volumes are
									kept and reused by the stack), changes the type to Stack and
									deploys it. The services are down until the stack deploy
									finishes.
								</span>
								{warnings.length > 0 && (
									<span className="mt-2 block">
										{warnings.length} listed change(s) apply.
									</span>
								)}
							</>
						}
						type="destructive"
						onClick={switchNow}
					>
						<Button
							className="w-fit"
							disabled={blocking.length > 0}
							isLoading={isPending}
						>
							Switch to Stack
						</Button>
					</DialogAction>
				)}
				{blocking.length > 0 && (
					<p className="text-sm text-muted-foreground">
						Fix the items marked "Must fix" in the compose file, deploy, and
						switch then.
					</p>
				)}
			</CardContent>
		</Card>
	);
};
