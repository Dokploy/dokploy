import type { IUpdateData } from "@dokploy/server/index";
import {
	Bug,
	Download,
	Info,
	RefreshCcw,
	Server,
	Sparkles,
	Stars,
	X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { ToggleAutoCheckUpdates } from "./toggle-auto-check-updates";
import { UpdateWebServer } from "./update-webserver";

interface Props {
	updateData?: IUpdateData;
	children?: React.ReactNode;
	isOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export const UpdateServer = ({
	updateData,
	children,
	isOpen: isOpenProp,
	onOpenChange: onOpenChangeProp,
}: Props) => {
	const { t } = useTranslation();
	const [hasCheckedUpdate, setHasCheckedUpdate] = useState(!!updateData);
	const [isUpdateAvailable, setIsUpdateAvailable] = useState(
		!!updateData?.updateAvailable,
	);
	const { mutateAsync: getUpdateData, isPending } =
		api.settings.getUpdateData.useMutation();
	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();
	const { data: releaseTag } = api.settings.getReleaseTag.useQuery();
	const [latestVersion, setLatestVersion] = useState(
		updateData?.latestVersion ?? "",
	);
	const [isOpenInternal, setIsOpenInternal] = useState(false);

	const handleCheckUpdates = async () => {
		try {
			const updateData = await getUpdateData();
			const versionToUpdate = updateData.latestVersion || "";
			setHasCheckedUpdate(true);
			setIsUpdateAvailable(updateData.updateAvailable);
			setLatestVersion(versionToUpdate);

			if (updateData.updateAvailable) {
				toast.success(versionToUpdate, {
					description: t("settings.webServer.updateServer.newVersionToast"),
				});
			} else {
				toast.info(t("settings.webServer.updateServer.noUpdates"));
			}
		} catch (error) {
			console.error("Error checking for updates:", error);
			setHasCheckedUpdate(true);
			setIsUpdateAvailable(false);
			toast.error(t("settings.webServer.updateServer.checkError"));
		}
	};

	const isOpen = isOpenInternal || isOpenProp;
	const onOpenChange = (open: boolean) => {
		setIsOpenInternal(open);
		onOpenChangeProp?.(open);
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				{children ? (
					children
				) : (
					<TooltipProvider delayDuration={0}>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant={updateData ? "outline" : "secondary"}
									size="sm"
									onClick={() => onOpenChange?.(true)}
								>
									<Download className="h-4 w-4 shrink-0" />
									{updateData ? (
										<span className="font-medium truncate group-data-[collapsible=icon]:hidden">
											{t("settings.webServer.updateServer.updateAvailable")}
										</span>
									) : (
										<span className="font-medium truncate group-data-[collapsible=icon]:hidden">
											{t("settings.webServer.updateServer.checkUpdates")}
										</span>
									)}
									{updateData && (
										<span className="absolute right-2 flex h-2 w-2 group-data-[collapsible=icon]:hidden">
											<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
											<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
										</span>
									)}
								</Button>
							</TooltipTrigger>
							{updateData && (
								<TooltipContent side="right" sideOffset={10}>
									<p>
										{t("settings.webServer.updateServer.updateAvailable")}
									</p>
								</TooltipContent>
							)}
						</Tooltip>
					</TooltipProvider>
				)}
			</DialogTrigger>
			<DialogContent className="max-w-lg" showCloseButton={false}>
				<div className="flex items-center gap-2 mb-8">
					<DialogTitle className="text-2xl font-semibold mr-auto">
						{t("settings.webServer.updateServer.title")}
					</DialogTitle>
					{dokployVersion && (
						<div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-muted">
							<Server className="h-4 w-4 text-muted-foreground" />
							<span className="text-sm text-muted-foreground">
								{dokployVersion}{" "}
								{(releaseTag === "canary" || releaseTag === "feature") &&
									`(${releaseTag})`}
							</span>
						</div>
					)}
					<DialogClose asChild>
						<Button variant="ghost" size="icon-sm" className="shrink-0">
							<X />
							<span className="sr-only">
								{t("settings.servers.connect.close")}
							</span>
						</Button>
					</DialogClose>
				</div>

				{/* Initial state */}
				{!hasCheckedUpdate && (
					<div className="mb-8">
						<p className="text text-muted-foreground">
							{t("settings.webServer.updateServer.intro")}
							<br />
							<br />
							{t("settings.webServer.updateServer.introHint")}
						</p>
					</div>
				)}

				{/* Update available state */}
				{isUpdateAvailable && latestVersion && (
					<div className="mb-8">
						<div className="inline-flex items-center gap-2 rounded-lg px-3 py-2 border border-emerald-900 bg-emerald-900 dark:bg-emerald-900/40 mb-4 w-full">
							<div className="flex items-center gap-1.5">
								<Download className="h-4 w-4 text-emerald-400" />
								<span className="text font-medium text-emerald-400 ">
									{t("settings.webServer.updateServer.newVersionLabel")}
								</span>
							</div>
							<span className="text font-semibold text-emerald-300">
								{latestVersion}
							</span>
						</div>

						<div className="space-y-4 text-muted-foreground">
							<p className="text">
								{t("settings.webServer.updateServer.considerUpdating")}
							</p>
							<ul className="space-y-3">
								<li className="flex items-start gap-2">
									<Stars className="h-5 w-5 mt-0.5 text-[#5B9DFF]" />
									<span className="text">
										{t("settings.webServer.updateServer.reasonFeatures")}
									</span>
								</li>
								<li className="flex items-start gap-2">
									<Bug className="h-5 w-5 mt-0.5 text-[#5B9DFF]" />
									<span className="text">
										{t("settings.webServer.updateServer.reasonIssues")}
									</span>
								</li>
							</ul>
						</div>
					</div>
				)}

				{/* Up to date state */}
				{hasCheckedUpdate && !isUpdateAvailable && !isPending && (
					<div className="mb-8">
						<div className="flex flex-col items-center gap-6 mb-6">
							<div className="rounded-full p-4 bg-emerald-400/40">
								<Sparkles className="h-8 w-8 text-emerald-400" />
							</div>
							<div className="text-center space-y-2">
								<h3 className="text-lg font-medium">
									{t("settings.webServer.updateServer.latestVersionTitle")}
								</h3>
								<p className="text text-muted-foreground">
									{t("settings.webServer.updateServer.latestVersionHint")}
								</p>
							</div>
						</div>
					</div>
				)}

				{hasCheckedUpdate && isPending && (
					<div className="mb-8">
						<div className="flex flex-col items-center gap-6 mb-6">
							<div className="rounded-full p-4 bg-[#5B9DFF]/40 text-foreground">
								<RefreshCcw className="h-8 w-8 animate-spin" />
							</div>
							<div className="text-center space-y-2">
								<h3 className="text-lg font-medium">
									{t("settings.webServer.updateServer.checkingTitle")}
								</h3>
								<p className="text text-muted-foreground">
									{t("settings.webServer.updateServer.checkingHint")}
								</p>
							</div>
						</div>
					</div>
				)}

				{isUpdateAvailable && (
					<div className="rounded-lg bg-[#16254D] p-4 mb-8">
						<div className="flex gap-2">
							<Info className="h-5 w-5 shrink-0 text-[#5B9DFF]" />
							<div className="text-[#5B9DFF]">
								{t("settings.webServer.updateServer.releaseNotesPrefix")}{" "}
								<Link
									href="https://github.com/Dokploy/dokploy/releases"
									target="_blank"
									className="text-white underline hover:text-zinc-200"
								>
									{t("settings.webServer.updateServer.releaseNotes")}
								</Link>{" "}
								{t("settings.webServer.updateServer.releaseNotesSuffix")}
							</div>
						</div>
					</div>
				)}

				<div className="flex items-center justify-between pt-2">
					<ToggleAutoCheckUpdates disabled={isPending} />
				</div>

				<div className="flex items-center justify-end mt-4">
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={() => onOpenChange?.(false)}>
							{t("settings.servers.deleteServer.cancel")}
						</Button>
						{isUpdateAvailable ? (
							<UpdateWebServer buttonClassName="w-auto" />
						) : (
							<Button
								variant="secondary"
								onClick={handleCheckUpdates}
								disabled={isPending}
							>
								{isPending ? (
									<>
										<RefreshCcw className="h-4 w-4 animate-spin" />
										{t("settings.webServer.updateServer.checkingShort")}
									</>
								) : (
									<>
										<RefreshCcw className="h-4 w-4" />
										{t("settings.webServer.updateServer.checkUpdates")}
									</>
								)}
							</Button>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default UpdateServer;
