import { useState } from "react";
import { InstallLibreDBStudioDialog } from "@/components/dashboard/libredb-studio/install-libredb-studio";
import { canSetUpLibreDBStudio } from "@/components/dashboard/libredb-studio/utils";
import { LibreDBStudioIcon } from "@/components/icons/data-tools-icons";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";

interface Props {
	environmentId: string;
}

export const AddLibreDBStudio = ({ environmentId }: Props) => {
	const [open, setOpen] = useState(false);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();

	if (
		!canSetUpLibreDBStudio({
			isCloud,
			canCreateServices: permissions?.service.create,
			canCreateDeployments: permissions?.deployment.create,
		})
	) {
		return null;
	}

	return (
		<InstallLibreDBStudioDialog
			environmentId={environmentId}
			open={open}
			onOpenChange={setOpen}
		>
			<DropdownMenuItem
				className="w-full cursor-pointer space-x-3"
				onSelect={(event) => event.preventDefault()}
			>
				<LibreDBStudioIcon className="size-4" />
				<span>LibreDB Studio</span>
			</DropdownMenuItem>
		</InstallLibreDBStudioDialog>
	);
};
