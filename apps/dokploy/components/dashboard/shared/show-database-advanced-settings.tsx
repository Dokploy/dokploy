import { ShowResources } from "@/components/dashboard/application/advanced/show-resources";
import { ShowVolumes } from "@/components/dashboard/application/advanced/volumes/show-volumes";
import { AssignNetworkToResource } from "@/components/dashboard/network/assign-network-to-resource";
import { ShowCustomCommand } from "@/components/dashboard/postgres/advanced/show-custom-command";
import { ShowClusterSettings } from "../application/advanced/cluster/show-cluster-settings";
import { RebuildDatabase } from "./rebuild-database";

interface Props {
	id: string;
	type: "postgres" | "mysql" | "mariadb" | "mongo" | "redis";
}

export const ShowDatabaseAdvancedSettings = ({ id, type }: Props) => {
	return (
		<div className="flex w-full flex-col gap-5">
			<ShowCustomCommand id={id} type={type} />
			<ShowClusterSettings id={id} type={type} />
			<ShowVolumes id={id} type={type} />
			<AssignNetworkToResource resourceId={id} resourceType={type} showCard />
			<ShowResources id={id} type={type} />
			<RebuildDatabase id={id} type={type} />
		</div>
	);
};
