import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

// Define all sidebar items that can be toggled
const SIDEBAR_ITEMS = {
	home: [
		{ key: "projects", label: "Projects", alwaysVisible: true },
		{ key: "monitoring", label: "Monitoring" },
		{ key: "schedules", label: "Schedules" },
		{ key: "traefik", label: "Traefik File System" },
		{ key: "docker", label: "Docker" },
		{ key: "swarm", label: "Swarm" },
		{ key: "requests", label: "Requests" },
	],
	settings: [
		{ key: "profile", label: "Profile", alwaysVisible: true },
		{ key: "web-server", label: "Web Server" },
		{ key: "remote-servers", label: "Remote Servers" },
		{ key: "users", label: "Users" },
		{ key: "ssh-keys", label: "SSH Keys" },
		{ key: "ai", label: "AI" },
		{ key: "git", label: "Git" },
		{ key: "registry", label: "Registry" },
		{ key: "s3-destinations", label: "S3 Destinations" },
		{ key: "certificates", label: "Certificates" },
		{ key: "cluster", label: "Cluster" },
		{ key: "notifications", label: "Notifications" },
		{ key: "billing", label: "Billing" },
	],
};

export const ShowSidebarConfig = () => {
	const { data: preferences, refetch } = api.userPreferences.get.useQuery();
	const { mutateAsync: toggleItem } =
		api.userPreferences.toggleSidebarItem.useMutation();

	const hiddenItems = (preferences?.hiddenSidebarItems as string[]) || [];

	const handleToggle = async (itemKey: string) => {
		try {
			await toggleItem({ itemKey });
			await refetch();
			toast.success("Sidebar configuration updated");
		} catch (error) {
			toast.error("Failed to update sidebar configuration");
		}
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					<Settings2 className="size-5" />
					Sidebar Configuration
				</CardTitle>
				<CardDescription>
					Show or hide sidebar items to customize your navigation experience
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				{/* Home Section */}
				<div className="space-y-3">
					<h3 className="text-sm font-semibold">Home</h3>
					<div className="space-y-2">
						{SIDEBAR_ITEMS.home.map((item) => (
							<div
								key={item.key}
								className="flex items-center justify-between rounded-md border p-3"
							>
								<Label htmlFor={item.key} className="cursor-pointer">
									{item.label}
								</Label>
								<Switch
									id={item.key}
									checked={!hiddenItems.includes(item.key)}
									onCheckedChange={() => handleToggle(item.key)}
									disabled={item.alwaysVisible}
									aria-label={`Toggle ${item.label}`}
								/>
							</div>
						))}
					</div>
				</div>

				{/* Settings Section */}
				<div className="space-y-3">
					<h3 className="text-sm font-semibold">Settings</h3>
					<div className="space-y-2">
						{SIDEBAR_ITEMS.settings.map((item) => (
							<div
								key={item.key}
								className="flex items-center justify-between rounded-md border p-3"
							>
								<Label htmlFor={item.key} className="cursor-pointer">
									{item.label}
								</Label>
								<Switch
									id={item.key}
									checked={!hiddenItems.includes(item.key)}
									onCheckedChange={() => handleToggle(item.key)}
									disabled={item.alwaysVisible}
									aria-label={`Toggle ${item.label}`}
								/>
							</div>
						))}
					</div>
				</div>
			</CardContent>
		</Card>
	);
};
