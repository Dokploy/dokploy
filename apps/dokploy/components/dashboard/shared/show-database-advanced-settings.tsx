import { ShowCustomCommand } from "@/components/dashboard/postgres/advanced/show-custom-command";
import { ShowResources } from "@/components/dashboard/application/advanced/show-resources";
import { ShowVolumes } from "@/components/dashboard/application/advanced/volumes/show-volumes";
import { RebuildDatabase } from "./rebuild-database";

interface Props {
	id: string;
	type: "postgres" | "mysql" | "mariadb" | "mongo" | "redis";
}

export const ShowDatabaseAdvancedSettings = ({ id, type }: Props) => {
	return (
		<div className="flex w-full flex-col gap-5">
			<ShowCustomCommand id={id} type={type} />
			<ShowVolumes id={id} type={type} />
			<ShowResources id={id} type={type} />
			<RebuildDatabase id={id} type={type} />
		</div>
	);
};
