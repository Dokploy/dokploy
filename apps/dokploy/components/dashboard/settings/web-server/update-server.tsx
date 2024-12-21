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
	Sparkles,
	Stars,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ToggleAutoCheckUpdates } from "./toggle-auto-check-updates";
import { UpdateWebServer } from "./update-webserver";

export const UpdateServer = () => {
	const [hasCheckedUpdate, setHasCheckedUpdate] = useState(false);
	const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
	const { mutateAsync: getUpdateData, isLoading } =
		api.settings.getUpdateData.useMutation();
	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();
	const [isOpen, setIsOpen] = useState(false);
	const [latestVersion, setLatestVersion] = useState("");

	const handleCheckUpdates = async () => {
		try {
			const updateData = await getUpdateData();
			setHasCheckedUpdate(true);
			setIsUpdateAvailable(updateData.updateAvailable);
			setLatestVersion(updateData.latestVersion || "");

			if (updateData.updateAvailable) {
				toast.success(`${updateData.latestVersion || ""} update is available!`);
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
				<Button variant="secondary" className="gap-2">
					<RefreshCcw className="h-4 w-4" />
					Updates
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-lg p-6">
				<div className="flex items-center justify-between mb-8">
					<DialogTitle className="text-2xl font-semibold text-white">
						Web Server Update
					</DialogTitle>
					{dokployVersion && (
						<div className="flex items-center gap-1.5 rounded-full bg-zinc-800/80 px-3 py-1 mr-2">
							<Server className="h-4 w-4 text-zinc-400" />
							<span className="text-sm text-zinc-400">{dokployVersion}</span>
						</div>
					)}
				</div>

				{/* Initial state */}
				{!hasCheckedUpdate && (
					<div className="mb-8">
						<p className="text text-zinc-400">
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
						<div className="inline-flex items-center gap-2 rounded-lg bg-emerald-950/30 px-3 py-2 border border-emerald-900 mb-4 w-full items-center">
							<div className="flex items-center gap-1.5">
								<span className="flex h-2 w-2">
									<span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75"></span>
									<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
								</span>
								<Download className="h-4 w-4 text-emerald-400" />
								<span className="text font-medium text-emerald-400">
									New version available:
								</span>
							</div>
							<span className="text font-semibold text-emerald-300">
								{latestVersion}
							</span>
						</div>

						<div className="space-y-4 text-zinc-400">
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
							<div className="rounded-full bg-zinc-800/80 p-4">
								<Sparkles className="h-8 w-8 text-emerald-400" />
							</div>
							<div className="text-center space-y-2">
								<h3 className="text-lg font-medium text-white">
									You are using the latest version
								</h3>
								<p className="text text-zinc-400">
									Your server is up to date with all the latest features and
									security improvements.
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
					<ToggleAutoCheckUpdates />
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
										Checking for updates...
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
