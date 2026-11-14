import { type ReactNode, useLayoutEffect } from "react";
import {
	LibreDBStudioInstallForm,
	useLibreDBStudioInstall,
} from "@/components/dashboard/libredb-studio/install-libredb-studio-form";
import { shouldResetStudioInstallOnOpen } from "@/components/dashboard/libredb-studio/utils";
import { LibreDBStudioIcon } from "@/components/icons/data-tools-icons";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
	environmentId: string;
	defaultServerId?: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children?: ReactNode;
}

export const InstallLibreDBStudioDialog = ({
	environmentId,
	defaultServerId,
	open,
	onOpenChange,
	children,
}: Props) => {
	const install = useLibreDBStudioInstall();
	useLayoutEffect(() => {
		if (shouldResetStudioInstallOnOpen({ open, pending: install.isPending })) {
			install.reset();
		}
	}, [open]);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{children && <DialogTrigger asChild>{children}</DialogTrigger>}
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex flex-row items-center gap-2">
						<LibreDBStudioIcon className="size-5" />
						LibreDB Studio
					</DialogTitle>
					<DialogDescription>
						Install LibreDB Studio for this environment. It connects to the
						databases of this environment that run on the selected server, and
						Dokploy keeps those connections up to date.
					</DialogDescription>
				</DialogHeader>
				<LibreDBStudioInstallForm
					environmentId={environmentId}
					defaultServerId={defaultServerId}
					active={open}
					install={install}
					onDone={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
};
