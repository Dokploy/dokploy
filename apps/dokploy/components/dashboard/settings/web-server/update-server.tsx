import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { UpdateWebServer } from "./update-webserver";

export const UpdateServer = () => {
	const [isUpdateAvailable, setIsUpdateAvailable] = useState<null | boolean>(
		null,
	);
	const { mutateAsync: checkAndUpdateImage, isLoading } =
		api.settings.checkAndUpdateImage.useMutation();
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary">
					<RefreshCcw className="h-4 w-4" />
					Updates
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:m:max-w-lg ">
				<DialogHeader>
					<DialogTitle>Web Server Update</DialogTitle>
					<DialogDescription>
						Check new releases and update your dokploy
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<span className="text-sm text-muted-foreground">
						We suggest to update your dokploy to the latest version only if you:
					</span>
					<ul className="list-disc list-inside text-sm text-muted-foreground">
						<li>Want to try the latest features</li>
						<li>Some bug that is blocking to use some features</li>
					</ul>
					<AlertBlock type="info">
						We recommend checking the latest version for any breaking changes 
						before updating. Go to{" "}
						<Link
							href="https://github.com/Dokploy/dokploy/releases"
							target="_blank"
							className="text-foreground"
						>
							Dokploy Releases
						</Link>{" "}
						to check the latest version.
					</AlertBlock>

					<div className="w-full flex flex-col gap-4">
						{isUpdateAvailable === false && (
							<div className="flex flex-col items-center gap-3">
								<RefreshCcw className="size-6 self-center text-muted-foreground" />
								<span className="text-sm text-muted-foreground">
									You are using the latest version
								</span>
							</div>
						)}
						{isUpdateAvailable ? (
							<UpdateWebServer />
						) : (
							<Button
								className="w-full"
								onClick={async () => {
									await checkAndUpdateImage()
										.then(async (e) => {
											setIsUpdateAvailable(e);
										})
										.catch(() => {
											setIsUpdateAvailable(false);
											toast.error("Error to check updates");
										});
									toast.success("Check updates");
								}}
								isLoading={isLoading}
							>
								Check Updates
							</Button>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
