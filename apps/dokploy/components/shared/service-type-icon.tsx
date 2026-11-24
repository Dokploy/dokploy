import type { ServiceType } from "@dokploy/server/db/schema";
import { CircuitBoard, GlobeIcon } from "lucide-react";
import type { ComponentType } from "react";
import {
	LibsqlIcon,
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { cn } from "@/lib/utils";

/** Every service type with its display label and icon, in the order filters list them. */
export const SERVICE_TYPE_OPTIONS: {
	value: ServiceType;
	label: string;
	icon: ComponentType<{ className?: string }>;
}[] = [
	{ value: "application", label: "Application", icon: GlobeIcon },
	{ value: "postgres", label: "PostgreSQL", icon: PostgresqlIcon },
	{ value: "mariadb", label: "MariaDB", icon: MariadbIcon },
	{ value: "mongo", label: "MongoDB", icon: MongodbIcon },
	{ value: "mysql", label: "MySQL", icon: MysqlIcon },
	{ value: "redis", label: "Redis", icon: RedisIcon },
	{ value: "compose", label: "Compose", icon: CircuitBoard },
	{ value: "libsql", label: "Libsql", icon: LibsqlIcon },
];

interface Props {
	type: ServiceType;
	/** A custom icon set on the service takes precedence over the type icon. */
	icon?: string | null;
	className?: string;
}

export const ServiceTypeIcon = ({
	type,
	icon,
	className = "size-4",
}: Props) => {
	if (icon) {
		return (
			<img
				src={icon}
				alt=""
				className={cn(className, "object-contain shrink-0")}
			/>
		);
	}
	const Icon =
		SERVICE_TYPE_OPTIONS.find((option) => option.value === type)?.icon ??
		GlobeIcon;
	return <Icon className={className} />;
};
