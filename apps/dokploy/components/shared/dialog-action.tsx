import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title ?? t("shared.areYouSure")}</AlertDialogTitle>
					<AlertDialogDescription>
						{description ?? t("shared.actionCannotBeUndone")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("shared.cancel")}</AlertDialogCancel>
					<AlertDialogAction
						disabled={disabled}
						onClick={onClick}
						variant={type ?? "destructive"}
					>
						{t("shared.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
