import { type ReactNode, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface Props {
	onConfirm: () => void;
	needsConfirmation: boolean;
	onValidate?: () => Promise<boolean> | boolean;
	isLoading?: boolean;
	disabled?: boolean;
	children?: ReactNode;
}

export const ConfirmableProviderSave = ({
	onConfirm,
	needsConfirmation,
	onValidate,
	isLoading,
	disabled,
	children = "Save",
}: Props) => {
	const [open, setOpen] = useState(false);

	if (!needsConfirmation) {
		return (
			<Button
				type="submit"
				className="w-fit"
				isLoading={isLoading}
				disabled={disabled}
			>
				{children}
			</Button>
		);
	}

	const handleClick = async () => {
		if (onValidate) {
			const valid = await onValidate();
			if (!valid) return;
		}
		setOpen(true);
	};

	return (
		<>
			<Button
				type="button"
				className="w-fit"
				isLoading={isLoading}
				disabled={disabled}
				onClick={handleClick}
			>
				{children}
			</Button>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Switch provider and disable preview deployments?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Preview deployments only run on the GitHub provider. Switching
							will disable preview deployments for this application; existing
							previews will stop receiving updates.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								setOpen(false);
								onConfirm();
							}}
						>
							Confirm
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
