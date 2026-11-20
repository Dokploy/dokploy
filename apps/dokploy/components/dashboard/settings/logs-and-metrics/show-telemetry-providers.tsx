import { Loader2, ScrollText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { telemetryProviderIcons } from "@/components/icons/telemetry-provider-icons";
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
import { HandleTelemetryProvider } from "./handle-telemetry-provider";

interface TelemetryProviderRowProps {
	provider: {
		telemetryProviderId: string;
		name: string;
		enabled: boolean;
		providerType: string;
		signals: string[];
	};
	index: number;
	typeLabel: string;
	canEdit: boolean;
	canDelete: boolean;
	onDeleted: () => void;
}

const TelemetryProviderRow = ({
	provider,
	index,
	typeLabel,
	canEdit,
	canDelete,
	onDeleted,
}: TelemetryProviderRowProps) => {
	const { mutateAsync, isPending: isRemoving } =
		api.telemetryProvider.remove.useMutation();
	const ProviderIcon =
		telemetryProviderIcons[
			provider.providerType as keyof typeof telemetryProviderIcons
		];

	return (
		<div className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg">
			<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border  w-full">
				<div className="flex flex-row items-center gap-3">
					{ProviderIcon && <ProviderIcon className="size-7 shrink-0" />}
					<div className="flex gap-2 flex-col">
						<span className="text-sm font-medium flex items-center gap-2">
							{index + 1}. {provider.name}
							<Badge variant={provider.enabled ? "green" : "secondary"}>
								{provider.enabled ? "Enabled" : "Disabled"}
							</Badge>
							{provider.signals.includes("logs") && (
								<Badge variant="blue">Logs</Badge>
							)}
							{provider.signals.includes("metrics") && (
								<Badge variant="orange">Metrics</Badge>
							)}
						</span>
						<div className="text-xs text-muted-foreground">{typeLabel}</div>
					</div>
				</div>

				<div className="flex flex-row gap-1">
					{canEdit && (
						<HandleTelemetryProvider
							telemetryProviderId={provider.telemetryProviderId}
						/>
					)}

					{canDelete && (
						<DialogAction
							title="Delete provider"
							description="Are you sure you want to delete this provider? Every agent shipping to it is re-applied without it, and removed if nothing is left."
							type="destructive"
							onClick={async () => {
								await mutateAsync({
									telemetryProviderId: provider.telemetryProviderId,
								})
									.then((result) => {
										if (result.warning) {
											toast.warning("Provider deleted", {
												description: result.warning,
											});
										} else {
											toast.success(
												"Provider deleted — the agents that used it were re-applied",
											);
										}
										onDeleted();
									})
									.catch(() => {
										toast.error("Error deleting provider");
									});
							}}
						>
							<Button
								variant="ghost"
								size="icon"
								className="group hover:bg-red-500/10 "
								isLoading={isRemoving}
							>
								<Trash2 className="size-4 text-primary group-hover:text-red-500" />
							</Button>
						</DialogAction>
					)}
				</div>
			</div>
		</div>
	);
};

export const ShowTelemetryProviders = () => {
	const utils = api.useUtils();
	const { data, isPending, refetch } = api.telemetryProvider.all.useQuery();
	const { data: availableTypes } =
		api.telemetryProvider.availableTypes.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const providerListLabel = availableTypes?.length
		? ` (${availableTypes.map((t) => t.label).join(", ")})`
		: "";

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<ScrollText className="size-6 text-muted-foreground self-center" />
							Logs & Metrics
						</CardTitle>
						<CardDescription>
							{`Ship container logs and host/container metrics to an external provider${providerListLabel}. Add one here, choose what it sends, then deploy the Vector agent on the servers below.`}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
										<ScrollText className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											You don't have any provider configured
										</span>
										{permissions?.telemetryProvider.create && (
											<HandleTelemetryProvider />
										)}
									</div>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg ">
											{data?.map((provider, index) => (
												<TelemetryProviderRow
													key={provider.telemetryProviderId}
													provider={provider}
													index={index}
													typeLabel={
														availableTypes?.find(
															(t) => t.type === provider.providerType,
														)?.label ?? provider.providerType
													}
													canEdit={!!permissions?.telemetryProvider.create}
													canDelete={!!permissions?.telemetryProvider.delete}
													onDeleted={() => {
														refetch();
														utils.telemetryProvider.serverStatus.invalidate();
													}}
												/>
											))}
										</div>

										{permissions?.telemetryProvider.create && (
											<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
												<HandleTelemetryProvider />
											</div>
										)}
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
