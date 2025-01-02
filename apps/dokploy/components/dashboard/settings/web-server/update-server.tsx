import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import {
	Bug,
	Download,
	Info,
	RefreshCcw,
	Server,
	ServerCrash,
	Sparkles,
	Stars,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ToggleAutoCheckUpdates } from "./toggle-auto-check-updates";
import { UpdateWebServer } from "./update-webserver";
import type { IUpdateData } from "@dokploy/server/index";

interface Props {
	updateData?: IUpdateData;
}

export const UpdateServer = ({ updateData }: Props) => {
	const [hasCheckedUpdate, setHasCheckedUpdate] = useState(!!updateData);
	const [isUpdateAvailable, setIsUpdateAvailable] = useState(
		!!updateData?.updateAvailable,
	);
	const { mutateAsync: getUpdateData, isLoading } =
		api.settings.getUpdateData.useMutation();
	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();
	const { data: releaseTag } = api.settings.getReleaseTag.useQuery();
	const [isOpen, setIsOpen] = useState(false);
	const [latestVersion, setLatestVersion] = useState(
		updateData?.latestVersion ?? "",
	);

	const handleCheckUpdates = async () => {
		try {
			const updateData = await getUpdateData();
			const versionToUpdate = updateData.latestVersion || "";
			setHasCheckedUpdate(true);
			setIsUpdateAvailable(updateData.updateAvailable);
			setLatestVersion(versionToUpdate);

			if (updateData.updateAvailable) {
				toast.success(versionToUpdate, {
					description: "New version available!",
				});
			} else {
				toast.info("No updates available");
			}
		} catch (error) {
			console.error("Error checking for updates:", error);
			setHasCheckedUpdate(true);
			setIsUpdateAvailable(false);
			toast.error(
				"An error occurred while checking for updates, please try again.",
			);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant={updateData ? "outline" : "secondary"}
					className="gap-2"
				>
					{updateData ? (
						<>
							<span className="flex h-2 w-2">
								<span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
								<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
							</span>
							Update available
						</>
					) : (
						<>
							<Sparkles className="h-4 w-4" />
							Updates
						</>
					)}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-lg p-6">
				<div className="flex items-center justify-between mb-8">
					<DialogTitle className="text-2xl font-semibold">
						Web Server Update
					</DialogTitle>
					{dokployVersion && (
						<div className="flex items-center gap-1.5 rounded-full px-3 py-1 mr-2 bg-muted">
							<Server className="h-4 w-4 text-muted-foreground" />
							<span className="text-sm text-muted-foreground">
								{dokployVersion} | {releaseTag}
							</span>
						</div>
					)}
				</div>

				{/* Initial state */}
				{!hasCheckedUpdate && (
					<div className="mb-8">
						<p className="text text-muted-foreground">
							Check for new releases and update Dokploy.
							<br />
							<br />
							We recommend checking for updates regularly to ensure you have the
							latest features and security improvements.
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
									New version available:
								</span>
							</div>
							<span className="text font-semibold text-emerald-300">
								{latestVersion}
							</span>
						</div>

						<div className="space-y-4 text-muted-foreground">
							<p className="text">
								A new version of the server software is available. Consider
								updating if you:
							</p>
							<ul className="space-y-3">
								<li className="flex items-start gap-2">
									<Stars className="h-5 w-5 mt-0.5 text-[#5B9DFF]" />
									<span className="text">
										Want to access the latest features and improvements
									</span>
								</li>
								<li className="flex items-start gap-2">
									<Bug className="h-5 w-5 mt-0.5 text-[#5B9DFF]" />
									<span className="text">
										Are experiencing issues that may be resolved in the new
										version
									</span>
								</li>
							</ul>
						</div>
					</div>
				)}

				{/* Up to date state */}
				{hasCheckedUpdate && !isUpdateAvailable && !isLoading && (
					<div className="mb-8">
						<div className="flex flex-col items-center gap-6 mb-6">
							<div className="rounded-full p-4 bg-emerald-400/40">
								<Sparkles className="h-8 w-8 text-emerald-400" />
							</div>
							<div className="text-center space-y-2">
								<h3 className="text-lg font-medium">
									You are using the latest version
								</h3>
								<p className="text text-muted-foreground">
									Your server is up to date with all the latest features and
									security improvements.
								</p>
							</div>
						</div>
					</div>
				)}

				{hasCheckedUpdate && isLoading && (
					<div className="mb-8">
						<div className="flex flex-col items-center gap-6 mb-6">
							<div className="rounded-full p-4 bg-[#5B9DFF]/40 text-foreground">
								<RefreshCcw className="h-8 w-8 animate-spin" />
							</div>
							<div className="text-center space-y-2">
								<h3 className="text-lg font-medium">Checking for updates...</h3>
								<p className="text text-muted-foreground">
									Please wait while we pull the latest version information from
									Docker Hub.
								</p>
							</div>
						</div>
					</div>
				)}

				{isUpdateAvailable && (
					<div className="rounded-lg bg-[#16254D] p-4 mb-8">
						<div className="flex gap-2">
							<Info className="h-5 w-5 flex-shrink-0 text-[#5B9DFF]" />
							<div className="text-[#5B9DFF]">
								We recommend reviewing the{" "}
								<Link
									href="https://github.com/Dokploy/dokploy/releases"
									target="_blank"
									className="text-white underline hover:text-zinc-200"
								>
									release notes
								</Link>{" "}
								for any breaking changes before updating.
							</div>
						</div>
					</div>
				)}

				<div className="flex items-center justify-between pt-2">
					<ToggleAutoCheckUpdates disabled={isLoading} />
				</div>

				<div className="space-y-4 flex items-center justify-end">
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={() => setIsOpen(false)}>
							Cancel
						</Button>
						{isUpdateAvailable ? (
							<UpdateWebServer />
						) : (
							<Button
								variant="secondary"
								onClick={handleCheckUpdates}
								disabled={isLoading}
							>
								{isLoading ? (
									<>
										<RefreshCcw className="h-4 w-4 animate-spin" />
										Checking for updates
									</>
								) : (
									<>
										<RefreshCcw className="h-4 w-4" />
										Check for updates
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
