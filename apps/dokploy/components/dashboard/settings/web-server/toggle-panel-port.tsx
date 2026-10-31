import copy from "copy-to-clipboard";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useHealthCheckAfterMutation } from "@/hooks/use-health-check-after-mutation";
import { api } from "@/utils/api";

export const TogglePanelPort = () => {
	const { data, refetch } = api.settings.getPanelPortStatus.useQuery();
	const { mutateAsync, isPending } = api.settings.togglePanelPort.useMutation();

	const { execute, isExecuting } = useHealthCheckAfterMutation({
		initialDelay: 5000,
		pollInterval: 3000,
		successMessage: data?.enabled ? "Port 3000 disabled" : "Port 3000 enabled",
		onSuccess: () => {
			refetch();
		},
	});

	const canDisable = !!data?.panelHost && data.accessedViaPanelHost;
	const blocked = data?.enabled && !canDisable;

	return (
		<DialogAction
			title={data?.enabled ? "Disable Port 3000" : "Enable Port 3000"}
			description={
				<div className="space-y-4">
					{data?.enabled ? (
						<>
							<p>
								The panel will stop being reachable at{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-xs">
									http://&lt;server-ip&gt;:3000
								</code>{" "}
								and will only be available through{" "}
								<strong>{data.panelHost ?? "your domain"}</strong>.
							</p>
							{!data.panelHost && (
								<AlertBlock
									type="error"
									className="items-center [&>div:first-child]:mt-0"
								>
									Configure a domain for the panel first.
								</AlertBlock>
							)}
							{data.panelHost && !data.accessedViaPanelHost && (
								<AlertBlock
									type="error"
									className="items-center [&>div:first-child]:mt-0"
								>
									You must be accessing the panel through{" "}
									<strong>{data.panelHost}</strong> to disable port 3000.
								</AlertBlock>
							)}
						</>
					) : (
						<p>
							The panel will be reachable again at{" "}
							<code className="rounded bg-muted px-1 py-0.5 text-xs">
								http://&lt;server-ip&gt;:3000
							</code>
							.
						</p>
					)}
					<AlertBlock
						type="warning"
						className="items-center [&>div:first-child]:mt-0"
					>
						The Dokploy service will restart, which takes a few seconds.
					</AlertBlock>
					{data?.enabled && (
						<div className="space-y-2">
							<p className="text-sm">
								If you lose access, run this on the server to re-enable the
								port:
							</p>
							<div className="flex items-center gap-2 rounded-md bg-muted p-2">
								<code className="flex-1 break-all text-xs">
									{data.recoveryCommand}
								</code>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="shrink-0"
									onClick={() => {
										copy(data.recoveryCommand);
										toast.success("Command copied to clipboard");
									}}
								>
									<CopyIcon className="size-4" />
								</Button>
							</div>
						</div>
					)}
				</div>
			}
			onClick={async () => {
				try {
					await execute(() => mutateAsync({ enable: !data?.enabled }));
				} catch (error) {
					toast.error(
						(error as Error)?.message || "Failed to update port 3000",
					);
				}
			}}
			disabled={blocked || isPending || isExecuting}
			type={data?.enabled ? "destructive" : "default"}
		>
			<DropdownMenuItem
				onSelect={(e) => e.preventDefault()}
				className="cursor-pointer"
				disabled={isPending || isExecuting}
			>
				{data?.enabled ? "Disable" : "Enable"} Port 3000
			</DropdownMenuItem>
		</DialogAction>
	);
};
