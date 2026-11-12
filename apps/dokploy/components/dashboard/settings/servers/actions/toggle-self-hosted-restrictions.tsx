import { HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

const controls = [
	{
		key: "remoteServersOnly",
		label: "Remote Servers Only",
		description:
			"When enabled, all services (applications, databases, compose) must be deployed to a remote server. Deploying directly to the Dokploy host VM is not allowed.",
	},
	{
		key: "enforceSSO",
		label: "Enforce SSO",
		description:
			"When enabled, the email/password login form is hidden and users must sign in exclusively through SSO.",
	},
	{
		key: "hideSocialIcons",
		label: "Hide Social Icons",
		description:
			"When enabled, GitHub, X, and Discord icons are hidden on the login, registration, invitation and password reset pages.",
	},
	{
		key: "hideDocsLink",
		label: "Hide Documentation Link",
		description:
			'Hide the "Documentation" link from the sidebar. Cannot be enabled if a custom Documentation URL is set in Whitelabeling.',
	},
	{
		key: "hideSupportLink",
		label: "Hide Support Link",
		description:
			'Hide the "Support" link from the sidebar. Cannot be enabled if a custom Support URL is set in Whitelabeling.',
	},
	{
		key: "hideSSOButton",
		label: "Hide SSO Button",
		description:
			"Hide the SSO sign-in option from the login page. Cannot be enabled if SSO providers are configured or Enforce SSO is active.",
	},
	{
		key: "hidePasskeyButton",
		label: "Hide Passkey Button",
		description:
			"Hide the passkey sign-in button and passkey setup from the interface. Cannot be enabled if any user has passkeys configured.",
	},
] as const;

export const ToggleSelfHostedRestrictions = () => {
	const { data, refetch } = api.settings.getWebServerSettings.useQuery();
	const remoteServersOnly = api.settings.updateRemoteServersOnly.useMutation();
	const enforceSSO = api.settings.updateEnforceSSO.useMutation();
	const visibility = api.settings.updateVisibilityControls.useMutation();

	const save = (key: (typeof controls)[number]["key"], value: boolean) => {
		if (key === "remoteServersOnly") {
			return remoteServersOnly.mutateAsync({ remoteServersOnly: value });
		}
		if (key === "enforceSSO") {
			return enforceSSO.mutateAsync({ enforceSSO: value });
		}
		return visibility.mutateAsync({ [key]: value });
	};

	return controls.map(({ key, label, description }) => (
		<div key={key} className="flex items-center gap-4">
			<Switch
				checked={!!data?.[key]}
				onCheckedChange={async (checked) => {
					try {
						await save(key, checked);
						await refetch();
						toast.success(`${label} updated`);
					} catch (error: any) {
						toast.error(error?.message || `Error updating ${label}`);
					}
				}}
			/>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-primary flex items-center gap-1.5 cursor-pointer">
							{label}
							<HelpCircle className="size-4 text-muted-foreground" />
						</Label>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-sm">
						<p>{description}</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	));
};
