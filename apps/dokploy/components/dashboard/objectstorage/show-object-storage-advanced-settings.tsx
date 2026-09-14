import { ShowResources } from "@/components/dashboard/application/advanced/show-resources";
import { ShowVolumes } from "@/components/dashboard/application/advanced/volumes/show-volumes";
import { AssignNetworks } from "@/components/dashboard/networks/assign-networks";
import { ShowObjectStorageCustomCommand } from "./advanced/show-custom-command";

interface Props {
	id: string;
}

export const ShowObjectStorageAdvancedSettings = ({ id }: Props) => {
	return (
		<div className="flex w-full flex-col gap-5">
			<ShowObjectStorageCustomCommand id={id} />
			<ShowVolumes id={id} type="objectstorage" />
			<AssignNetworks id={id} type="objectstorage" />
			<ShowResources id={id} type="objectstorage" />
		</div>
	);
};
