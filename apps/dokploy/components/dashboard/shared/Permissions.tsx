import { api } from "@/utils/api";
import type { PermissionName } from "@dokploy/server/lib/permissions";
import { useMemo } from "react";

interface Props {
	permissions: PermissionName[];
	children: React.ReactNode;
}

export const Permissions = ({ permissions, children }: Props) => {
	const { data: auth } = api.user.get.useQuery();

	const hasPermission = useMemo(() => {
		if (auth?.role?.name === "owner" || auth?.role?.name === "admin") {
			return true;
		}

		return permissions.some((permission) =>
			auth?.role?.permissions?.includes(permission),
		);
	}, [permissions, auth]);

	if (!hasPermission) {
		return null;
	}

	return <>{children}</>;
};
