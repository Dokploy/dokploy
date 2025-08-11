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
import { useTranslation } from "next-i18next";

interface Props {
	title?: string | React.ReactNode;
	description?: string | React.ReactNode;
	onClick: () => void;
	children?: React.ReactNode;
	disabled?: boolean;
	type?: "default" | "destructive";
}

export const DialogAction = ({
	onClick,
	children,
	description,
	title,
	disabled,
	type,
}: Props) => {
	const { t } = useTranslation("common");

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{title ?? t("common.dialog.areYouSure")}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{description ?? t("common.dialog.cannotUndo")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("common.dialog.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						disabled={disabled}
						onClick={onClick}
						variant={type ?? "destructive"}
					>
						{t("common.dialog.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
