import { Key } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

export function LicenseKeySettings() {
	const utils = api.useUtils();
	const { data, isLoading } = api.licenseKey.getEnterpriseSettings.useQuery();
	const { mutateAsync: updateEnterpriseSettings, isLoading: isSaving } =
		api.licenseKey.updateEnterpriseSettings.useMutation();
	const { mutateAsync: activateLicenseKey, isLoading: isActivating } =
		api.licenseKey.activate.useMutation();
	const { mutateAsync: validateLicenseKey, isLoading: isValidating } =
		api.licenseKey.validate.useMutation();
	const { mutateAsync: deactivateLicenseKey, isLoading: isDeactivating } =
		api.licenseKey.deactivate.useMutation();

	const [licenseKey, setLicenseKey] = useState("");
	const [isValid, setIsValid] = useState(false);

	useEffect(() => {
		if (data?.licenseKey) {
			setLicenseKey(data.licenseKey);
			validateLicenseKey({ licenseKey: data.licenseKey })
				.then((valid) => {
					console.log("valid", valid);
					setIsValid(valid);
				})
				.catch(() => setIsValid(false));
		}
	}, [data?.licenseKey, validateLicenseKey]);

	const enabled = !!data?.enableEnterpriseFeatures;

	return (
		<div className="flex flex-col gap-4 rounded-lg border p-4">
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<Key className="size-6 text-muted-foreground" />
						<CardTitle className="text-xl">License Key</CardTitle>
					</div>

					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground">
							{enabled ? "Enabled" : "Disabled"}
						</span>
						<Switch
							checked={enabled}
							disabled={isLoading || isSaving || isDeactivating}
							onCheckedChange={async (next) => {
								try {
									await updateEnterpriseSettings({
										enableEnterpriseFeatures: next,
									});
									await utils.licenseKey.getEnterpriseSettings.invalidate();
									toast.success("Enterprise features updated");
								} catch (error) {
									console.error(error);
									toast.error("Failed to update enterprise features");
								}
							}}
						/>
					</div>
				</div>

				<p className="text-sm text-muted-foreground">
					To unlock extra features you need an enterprise license key. Contact
					us{" "}
					<Link
						href="http://localhost:3001/contact"
						target="_blank"
						rel="noreferrer"
						className="underline underline-offset-4"
					>
						here
					</Link>
					.
				</p>
			</div>

			{enabled && (
				<div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
					<div className="space-y-2">
						<label className="text-sm font-medium" htmlFor="licenseKey">
							License Key
						</label>
						<Input
							id="licenseKey"
							placeholder="Enter your enterprise license key"
							value={licenseKey}
							onChange={(e) => setLicenseKey(e.target.value)}
						/>
					</div>
					<div className="md:justify-self-end flex gap-2">
						{isValid && (
							<DialogAction
								title="Deactivate License Key"
								description="Are you sure you want to deactivate this license key? This will disable enterprise features."
								onClick={async () => {
									try {
										await deactivateLicenseKey({ licenseKey });
										await utils.licenseKey.getEnterpriseSettings.invalidate();
										setIsValid(false);
										toast.success("License key deactivated");
									} catch (error) {
										console.error(error);
										toast.error(
											error instanceof Error
												? error.message
												: "Failed to deactivate license key",
										);
									}
								}}
								disabled={isDeactivating || !data?.licenseKey}
							>
								<Button
									variant="destructive"
									disabled={isDeactivating || !data?.licenseKey}
								>
									Deactivate
								</Button>
							</DialogAction>
						)}
						<Button
							variant="outline"
							disabled={isSaving || isValidating || isDeactivating}
							onClick={async () => {
								try {
									const valid = await validateLicenseKey({ licenseKey });
									if (valid) {
										toast.success("License key is valid");
									} else {
										toast.error("License key is invalid");
									}
								} catch (error) {
									console.error(error);
									toast.error(
										error instanceof Error
											? error.message
											: "Failed to validate license key",
									);
								}
							}}
						>
							Validate
						</Button>
						{!isValid && (
							<Button
								variant="secondary"
								disabled={isSaving || isValidating || isDeactivating}
								onClick={async () => {
									try {
										await activateLicenseKey({ licenseKey });
										await utils.licenseKey.getEnterpriseSettings.invalidate();
										// Re-validate after saving to update the Deactivate button visibility
										const valid = await validateLicenseKey({ licenseKey });
										setIsValid(valid);
										toast.success("License key activated");
									} catch (error) {
										console.error(error);
										toast.error(
											error instanceof Error
												? error.message
												: "Failed to activate license key",
										);
									}
								}}
							>
								Activate
							</Button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
