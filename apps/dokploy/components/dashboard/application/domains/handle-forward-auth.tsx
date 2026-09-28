import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

interface Props {
	domainId: string;
	applicationId: string;
}

export const HandleForwardAuth = ({ domainId, applicationId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	const { data: haveValidLicense } =
		api.licenseKey.haveValidLicenseKey.useQuery();

	const utils = api.useUtils();

	const { data: status } = api.forwardAuth.status.useQuery(
		{ domainId },
		{ enabled: isOpen },
	);

	const { mutateAsync: enable, isPending: isEnabling } =
		api.forwardAuth.enable.useMutation();
	const { mutateAsync: disable, isPending: isDisabling } =
		api.forwardAuth.disable.useMutation();

	if (!haveValidLicense) {
		return null;
	}

	const isEnabled = !!status?.enabled;
	const isPending = isEnabling || isDisabling;

	const refresh = async () => {
		await utils.forwardAuth.status.invalidate({ domainId });
		await utils.domain.byApplicationId.invalidate({ applicationId });
		await utils.application.readTraefikConfig.invalidate({ applicationId });
	};

	const handleToggle = async (next: boolean) => {
		try {
			if (next) {
				await enable({ domainId });
				toast.success("SSO authentication enabled for this domain");
			} else {
				await disable({ domainId });
				toast.success("SSO authentication disabled for this domain");
			}
			await refresh();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Error updating SSO authentication",
			);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-emerald-500/10"
					title="SSO authentication"
				>
					<ShieldCheck
						className={`size-4 ${
							isEnabled
								? "text-emerald-500"
								: "text-primary group-hover:text-emerald-500"
						}`}
					/>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>SSO Authentication</DialogTitle>
					<DialogDescription>
						Require visitors to authenticate against your identity provider
						before reaching this application.
					</DialogDescription>
				</DialogHeader>

				<AlertBlock type="warning">
					<div className="flex flex-col gap-1">
						<span className="font-medium">Requirements</span>
						<ol className="list-decimal pl-4 text-sm">
							<li>
								The authentication proxy container must be deployed and running
								on this app's server. Configure it under{" "}
								<span className="font-medium">
									Settings → SSO → Application Authentication
								</span>
								.
							</li>
							<li>
								This domain must share the same base domain as the
								authentication domain (e.g. <code>app.acme.com</code> and{" "}
								<code>auth.acme.com</code>).
							</li>
						</ol>
					</div>
				</AlertBlock>

				<div className="flex items-center justify-between rounded-lg border p-4 mt-2">
					<div className="flex flex-col">
						<span className="text-sm font-medium">
							Protect this domain with SSO
						</span>
						<span className="text-xs text-muted-foreground">
							{isEnabled
								? "Visitors must log in via your identity provider."
								: "The domain is publicly accessible."}
						</span>
					</div>
					<Switch
						checked={isEnabled}
						disabled={isPending}
						onCheckedChange={handleToggle}
					/>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => setIsOpen(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
