import { ShowResources } from "@/components/dashboard/application/advanced/show-resources";
import { ShowVolumes } from "@/components/dashboard/application/advanced/volumes/show-volumes";
import { ShowCustomCommand } from "@/components/dashboard/postgres/advanced/show-custom-command";
import { ShowClusterSettings } from "../application/advanced/cluster/show-cluster-settings";
import { RebuildDatabase } from "./rebuild-database";
import { TransferService } from "./transfer-service";

interface Props {
	id: string;
	type: "postgres" | "mysql" | "mariadb" | "mongo" | "redis";
	serverId?: string | null;
}

export const ShowDatabaseAdvancedSettings = ({ id, type, serverId }: Props) => {
	return (
		<div className="flex w-full flex-col gap-5">
			<ShowCustomCommand id={id} type={type} />
			<ShowClusterSettings id={id} type={type} />
			<ShowVolumes id={id} type={type} />
			<ShowResources id={id} type={type} />
			<TransferService id={id} type={type} currentServerId={serverId} />
			<RebuildDatabase id={id} type={type} />
		</div>
	);
};
