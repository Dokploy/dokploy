import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import { ActivityTab } from "./activity-tab";
import { ExposedPortsTab } from "./exposed-ports-tab";
import { Fail2banTab } from "./fail2ban-tab";
import { SshTab } from "./ssh-tab";
import { UpdatesTab } from "./updates-tab";

interface Props {
	serverId: string;
	children: React.ReactNode;
}

export const ShowServerSecurity = ({ serverId, children }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canEdit = !!permissions?.server.create;

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent
				className="sm:max-w-5xl max-h-[90vh] overflow-y-auto"
				onCloseAutoFocus={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldCheck className="size-5" /> Server Security
					</DialogTitle>
					<DialogDescription>
						Harden this server and review what is exposed and who is connecting
						to it. Changes are applied directly on the server over SSH.
					</DialogDescription>
				</DialogHeader>
				{isOpen && (
					<Tabs defaultValue="fail2ban" className="w-full">
						<TabsList className="grid w-full grid-cols-5">
							<TabsTrigger value="fail2ban">Fail2ban</TabsTrigger>
							<TabsTrigger value="ports">Exposed Ports</TabsTrigger>
							<TabsTrigger value="ssh">SSH</TabsTrigger>
							<TabsTrigger value="updates">Updates</TabsTrigger>
							<TabsTrigger value="activity">Activity</TabsTrigger>
						</TabsList>
						<TabsContent value="fail2ban">
							<Fail2banTab serverId={serverId} canEdit={canEdit} />
						</TabsContent>
						<TabsContent value="ports">
							<ExposedPortsTab serverId={serverId} />
						</TabsContent>
						<TabsContent value="ssh">
							<SshTab serverId={serverId} canEdit={canEdit} />
						</TabsContent>
						<TabsContent value="updates">
							<UpdatesTab serverId={serverId} />
						</TabsContent>
						<TabsContent value="activity">
							<ActivityTab serverId={serverId} canEdit={canEdit} />
						</TabsContent>
					</Tabs>
				)}
			</DialogContent>
		</Dialog>
	);
};
