import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { InfoIcon, TrashIcon } from "lucide-react";
import React from "react";
import { toast } from "sonner";

interface Props {
	gitProviderId: string;
	gitProviderType: "github" | "gitlab" | "bitbucket";
}

export const RemoveGitProvider = ({
	gitProviderId,
	gitProviderType,
}: Props) => {
	const utils = api.useUtils();
	const { mutateAsync } = api.gitProvider.remove.useMutation();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost">
					<TrashIcon className="size-4 text-muted-destructive" />
					{gitProviderType === "github" && (
						<TooltipProvider delayDuration={0}>
							<Tooltip>
								<TooltipTrigger asChild>
									<InfoIcon className="size-4 fill-muted-destructive text-muted-destructive" />
								</TooltipTrigger>
								<TooltipContent>
									We recommend deleting the GitHub app first, and then removing
									the current one from here.
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete the
						associated github application
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								gitProviderId: gitProviderId,
							})
								.then(async () => {
									utils.gitProvider.getAll.invalidate();
									toast.success("Git Provider deleted successfully.");
								})
								.catch(() => {
									toast.error("Error deleting Git provider.");
								});
						}}
					>
						Confirm
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
