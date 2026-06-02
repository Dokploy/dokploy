import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	domainId: string;
	applicationId: string;
}

export const HandleForwardAuth = ({ domainId, applicationId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedProviderId, setSelectedProviderId] = useState<string>("");

	const { data: haveValidLicense } =
		api.licenseKey.haveValidLicenseKey.useQuery();

	const utils = api.useUtils();

	const { data: status, isLoading: isLoadingStatus } =
		api.forwardAuth.status.useQuery({ domainId }, { enabled: isOpen });
	const { data: providers, isLoading: isLoadingProviders } =
		api.forwardAuth.listProviders.useQuery(undefined, { enabled: isOpen });

	const { mutateAsync: enable, isPending: isEnabling } =
		api.forwardAuth.enable.useMutation();
	const { mutateAsync: disable, isPending: isDisabling } =
		api.forwardAuth.disable.useMutation();

	useEffect(() => {
		if (status?.providerId) {
			setSelectedProviderId(status.providerId);
		}
	}, [status?.providerId]);

	if (!haveValidLicense) {
		return null;
	}

	const isEnabled = !!status?.enabled;
	const hasProviders = (providers?.length ?? 0) > 0;

	const refresh = async () => {
		await utils.forwardAuth.status.invalidate({ domainId });
		await utils.domain.byApplicationId.invalidate({ applicationId });
		await utils.application.readTraefikConfig.invalidate({ applicationId });
	};

	const handleEnable = async () => {
		if (!selectedProviderId) {
			toast.error("Select an SSO provider first");
			return;
		}
		try {
			await enable({ domainId, providerId: selectedProviderId });
			await refresh();
			toast.success("SSO authentication enabled for this domain");
			setIsOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error enabling SSO",
			);
		}
	};

	const handleDisable = async () => {
		try {
			await disable({ domainId });
			await refresh();
			toast.success("SSO authentication disabled for this domain");
			setIsOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error disabling SSO",
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

				{!isLoadingProviders && !hasProviders && (
					<AlertBlock type="warning">
						No SSO providers configured. Add an OIDC provider in your
						organization SSO settings first.
					</AlertBlock>
				)}

				<AlertBlock type="info">
					Requires the authentication domain + proxy to be configured in SSO
					settings, and this app's domain to share its base domain.
				</AlertBlock>

				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-2">
						<span className="text-sm font-medium">Identity provider</span>
						<Select
							value={selectedProviderId}
							onValueChange={setSelectedProviderId}
							disabled={isLoadingStatus || isLoadingProviders || !hasProviders}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select an SSO provider">
									{selectedProviderId || ""}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{providers?.map((provider) => (
									<SelectItem
										key={provider.providerId}
										value={provider.providerId}
									>
										<div className="flex flex-col">
											<span className="font-medium">{provider.providerId}</span>
											<span className="text-xs text-muted-foreground">
												{provider.issuer}
											</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{isEnabled && (
						<AlertBlock type="info">
							SSO is currently enabled for this domain.
						</AlertBlock>
					)}
				</div>

				<DialogFooter className="flex-row justify-end gap-2">
					{isEnabled && (
						<Button
							variant="destructive"
							isLoading={isDisabling}
							onClick={handleDisable}
						>
							Disable
						</Button>
					)}
					<Button
						isLoading={isEnabling}
						disabled={!hasProviders || !selectedProviderId}
						onClick={handleEnable}
					>
						{isEnabled ? "Update" : "Enable"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
