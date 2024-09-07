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
import { Button } from "../ui/button";
import { AlertCircle, TrashIcon } from "lucide-react";

interface Props {
	title?: string;
	description?: string;
	onClick: () => void;
	children?: React.ReactNode;
}

export const DialogAction = ({
	onClick,
	children,
	description,
	title,
}: Props) => {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{title ?? "Are you absolutely sure?"}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{description ?? "This action cannot be undone."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onClick}>Confirm</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};
