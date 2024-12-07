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
import { api } from "@/utils/api";
import { TrashIcon } from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { useTranslation } from "next-i18next";

interface Props {
	destinationId: string;
}
export const DeleteDestination = ({ destinationId }: Props) => {
	const { t } = useTranslation("settings");
	const { mutateAsync, isLoading } = api.destination.remove.useMutation();
	const utils = api.useUtils();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" isLoading={isLoading}>
					<TrashIcon className="size-4  text-muted-foreground" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("settings.common.areYouSure")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("settings.s3destinations.delete.description")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("settings.common.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								destinationId,
							})
								.then(() => {
									utils.destination.all.invalidate();
									toast.success(t("settings.s3destinations.deleted"));
								})
								.catch(() => {
									toast.error(t("settings.s3destinations.errorDelete"));
								});
						}}
					>
						{t("settings.common.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
