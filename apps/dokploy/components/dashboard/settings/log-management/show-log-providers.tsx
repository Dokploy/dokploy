import { Loader2, ScrollText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { logProviderIcons } from "@/components/icons/log-provider-icons";
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
import { HandleLogProvider } from "./handle-log-provider";

interface LogProviderRowProps {
	provider: {
		logProviderId: string;
		name: string;
		enabled: boolean;
		providerType: string;
	};
	index: number;
	typeLabel: string;
	canEdit: boolean;
	canDelete: boolean;
	onDeleted: () => void;
}

const LogProviderRow = ({
	provider,
	index,
	typeLabel,
	canEdit,
	canDelete,
	onDeleted,
}: LogProviderRowProps) => {
	const { mutateAsync, isPending: isRemoving } =
		api.logProvider.remove.useMutation();
	const ProviderIcon =
		logProviderIcons[provider.providerType as keyof typeof logProviderIcons];

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
						</span>
						<div className="text-xs text-muted-foreground">{typeLabel}</div>
					</div>
				</div>

				<div className="flex flex-row gap-1">
					{canEdit && (
						<HandleLogProvider logProviderId={provider.logProviderId} />
					)}

					{canDelete && (
						<DialogAction
							title="Delete Log Provider"
							description="Are you sure you want to delete this log provider? Vector will stop shipping logs to it."
							type="destructive"
							onClick={async () => {
								await mutateAsync({
									logProviderId: provider.logProviderId,
								})
									.then(() => {
										toast.success("Log provider deleted successfully");
										onDeleted();
									})
									.catch(() => {
										toast.error("Error deleting log provider");
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

export const ShowLogProviders = () => {
	const utils = api.useUtils();
	const { data, isPending, refetch } = api.logProvider.all.useQuery();
	const { data: availableTypes } = api.logProvider.availableTypes.useQuery();
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
							Log Management
						</CardTitle>
						<CardDescription>
							{`Ship container logs to an external provider${providerListLabel}. Add one here, then deploy the Vector agent on the servers below.`}
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
											You don't have any log provider configured
										</span>
										{permissions?.logProvider.create && <HandleLogProvider />}
									</div>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg ">
											{data?.map((provider, index) => (
												<LogProviderRow
													key={provider.logProviderId}
													provider={provider}
													index={index}
													typeLabel={
														availableTypes?.find(
															(t) => t.type === provider.providerType,
														)?.label ?? provider.providerType
													}
													canEdit={!!permissions?.logProvider.create}
													canDelete={!!permissions?.logProvider.delete}
													onDeleted={() => {
														refetch();
														utils.server.all?.invalidate?.();
													}}
												/>
											))}
										</div>

										{permissions?.logProvider.create && (
											<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
												<HandleLogProvider />
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
