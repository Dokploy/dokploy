import { api } from "@/utils/api";
import React from "react";
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
import { toast } from "sonner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
	TooltipProvider,
} from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";

export const RemoveGithubApp = () => {
	const { refetch } = api.auth.get.useQuery();
	const utils = api.useUtils();
	const { mutateAsync } = api.admin.cleanGithubApp.useMutation();

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="destructive">
					Remove Current Github App
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
							await mutateAsync()
								.then(async () => {
									await refetch();
									utils.admin.one.invalidate();
									await utils.admin.haveGithubConfigured.invalidate();
									toast.success("Github application deleted succesfully.");
								})
								.catch(() => {
									toast.error("Error to delete your github application.");
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
