import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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

interface Props {
	id: string;
	type: "application" | "compose";
}

export const CancelQueues = ({ id, type }: Props) => {
	const t = useTranslations("applicationDeployments");
	const tCommon = useTranslations("common");
	const { mutateAsync, isPending } =
		type === "application"
			? api.application.cleanQueues.useMutation()
			: api.compose.cleanQueues.useMutation();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	if (isCloud) {
		return null;
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" className="w-fit" isLoading={isPending}>
					{t("cancelQueues.trigger")}
					<Ban className="size-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("cancelQueues.title")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("cancelQueues.description")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							await mutateAsync({
								applicationId: id || "",
								composeId: id || "",
							})
								.then(() => {
									toast.success(t("cancelQueues.success"));
								})
								.catch((err) => {
									toast.error(err.message);
								});
						}}
					>
						{tCommon("confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
