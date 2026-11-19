import copy from "copy-to-clipboard";
import { CopyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useHealthCheckAfterMutation } from "@/hooks/use-health-check-after-mutation";
import { api } from "@/utils/api";

export const TogglePanelPort = () => {
	const { t } = useTranslation();
	const { data, refetch } = api.settings.getPanelPortStatus.useQuery();
	const { mutateAsync, isPending } = api.settings.togglePanelPort.useMutation();

	const { execute, isExecuting } = useHealthCheckAfterMutation({
		initialDelay: 5000,
		pollInterval: 3000,
		successMessage: data?.enabled
			? t("settings.webServer.panelPort.disabledToast")
			: t("settings.webServer.panelPort.enabledToast"),
		onSuccess: () => {
			refetch();
		},
	});

	const canDisable = !!data?.panelHost && data.accessedViaPanelHost;
	const blocked = data?.enabled && !canDisable;

	return (
		<DialogAction
			title={
				data?.enabled
					? t("settings.webServer.panelPort.disableTitle")
					: t("settings.webServer.panelPort.enableTitle")
			}
			description={
				<div className="space-y-4">
					{data?.enabled ? (
						<>
							<p>
								{t("settings.webServer.panelPort.disableDescription")}{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-xs">
									http://&lt;server-ip&gt;:3000
								</code>{" "}
								{t("settings.webServer.panelPort.disableSuffix")}{" "}
								<strong>
									{data.panelHost ??
										t("settings.webServer.panelPort.yourDomain")}
								</strong>
								.
							</p>
							{!data.panelHost && (
								<AlertBlock
									type="error"
									className="items-center [&>div:first-child]:mt-0"
								>
									{t("settings.webServer.panelPort.configureDomainFirst")}
								</AlertBlock>
							)}
							{data.panelHost && !data.accessedViaPanelHost && (
								<AlertBlock
									type="error"
									className="items-center [&>div:first-child]:mt-0"
								>
									{t("settings.webServer.panelPort.accessViaHost", {
										host: data.panelHost,
									})}
								</AlertBlock>
							)}
						</>
					) : (
						<p>
							{t("settings.webServer.panelPort.enableDescription")}{" "}
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
						{t("settings.webServer.panelPort.restartWarning")}
					</AlertBlock>
					{data?.enabled && (
						<div className="space-y-2">
							<p className="text-sm">
								{t("settings.webServer.panelPort.recoveryHint")}
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
										toast.success(t("settings.webServer.panelPort.copied"));
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
						(error as Error)?.message ||
							t("settings.webServer.panelPort.updateError"),
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
				{data?.enabled
					? t("settings.webServer.panelPort.disableTitle")
					: t("settings.webServer.panelPort.enableTitle")}
			</DropdownMenuItem>
		</DialogAction>
	);
};
