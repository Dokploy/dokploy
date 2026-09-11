import {
	AlertTriangle,
	CheckCircle2,
	Loader2,
	ScrollText,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
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
	const { mutateAsync: testConnectionById, isPending: isTesting } =
		api.logProvider.testConnectionById.useMutation();

	return (
		<div className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg">
			<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border  w-full">
				<div className="flex items-center justify-between">
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
						<Button
							variant="ghost"
							size="sm"
							isLoading={isTesting}
							onClick={async () => {
								await testConnectionById({
									logProviderId: provider.logProviderId,
								})
									.then((result) => {
										if (result.warning) {
											toast.message(result.warning);
										} else {
											toast.success("Connection tested successfully");
										}
									})
									.catch((error) => {
										toast.error(
											error instanceof Error
												? error.message
												: "Connection test failed",
										);
									});
							}}
						>
							<CheckCircle2 className="size-4" />
							Test
						</Button>
					)}
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
									.then((result) => {
										toast.success("Log provider deleted successfully");
										if (result.syncErrors && result.syncErrors.length > 0) {
											toast.error(
												`Failed to sync ${result.syncErrors.length} server(s) — they may still be shipping with the old config`,
											);
										}
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
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();
	const { data: servers } = api.server.all.useQuery();
	const providerListLabel = availableTypes?.length
		? ` (${availableTypes.map((t) => t.label).join(", ")})`
		: "";

	const hasAnyProvider = (data?.length ?? 0) > 0;
	const knowsAboutServers = servers !== undefined;
	const hasActiveTarget =
		!!webServerSettings?.enableLogManagement ||
		!!servers?.some((s) => s.enableLogManagement);
	const showNoActiveTargetBanner =
		hasAnyProvider && knowsAboutServers && !hasActiveTarget;

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
							{`Ship container logs to an external provider${providerListLabel}. Needs at least one provider here and the toggle enabled on each server's settings.`}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{showNoActiveTargetBanner && (
							<div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 mb-4">
								<AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
								<div className="flex flex-col gap-2 text-sm">
									<span className="text-yellow-700 dark:text-yellow-400">
										Nothing will ship yet — no server has Log Management turned
										on.
									</span>
									<Button asChild variant="outline" size="sm" className="w-fit">
										<Link
											href={
												isCloud
													? "/dashboard/settings/servers"
													: "/dashboard/settings/server"
											}
										>
											{isCloud ? "Go to Servers" : "Go to Web Server settings"}
										</Link>
									</Button>
								</div>
							</div>
						)}
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
