import { Key, Loader2, ShieldCheck } from "lucide-react";
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
	const { data, isPending } = api.licenseKey.getEnterpriseSettings.useQuery();
	const { mutateAsync: updateEnterpriseSettings, isPending: isSaving } =
		api.licenseKey.updateEnterpriseSettings.useMutation();
	const { mutateAsync: activateLicenseKey, isPending: isActivating } =
		api.licenseKey.activate.useMutation();
	const { mutateAsync: validateLicenseKey, isPending: isValidating } =
		api.licenseKey.validate.useMutation();
	const { mutateAsync: deactivateLicenseKey, isPending: isDeactivating } =
		api.licenseKey.deactivate.useMutation();
	const { data: haveValidLicenseKey, isPending: isCheckingLicenseKey } =
		api.licenseKey.haveValidLicenseKey.useQuery();
	const [licenseKey, setLicenseKey] = useState("");

	useEffect(() => {
		if (data?.licenseKey) {
			setLicenseKey(data.licenseKey);
		}
	}, [data?.licenseKey]);

	const enabled = !!data?.enableEnterpriseFeatures;

	return (
		<div className="flex flex-col gap-4 rounded-lg border p-4">
			{isCheckingLicenseKey ? (
				<div className="flex items-center gap-2 justify-center min-h-[25vh]">
					<Loader2 className="size-6 text-muted-foreground animate-spin" />
					<span className="text-sm text-muted-foreground">
						Checking license key...
					</span>
				</div>
			) : (
				<>
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between gap-4">
							<div className="flex items-center gap-2">
								<Key className="size-6 text-muted-foreground" />
								<CardTitle className="text-xl">License Key</CardTitle>
							</div>

							{enabled && (
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground">
										{enabled ? "Enabled" : "Disabled"}
									</span>
									<Switch
										checked={enabled}
										disabled={isPending || isSaving || isDeactivating}
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
							)}
						</div>

						<p className="text-sm text-muted-foreground">
							To unlock extra features you need an enterprise license key.
							Contact us{" "}
							<Link
								href="https://dokploy.com/contact"
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-4"
							>
								here
							</Link>
							.
						</p>
					</div>
					{enabled ? (
						<>
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
									{haveValidLicenseKey && (
										<DialogAction
											title="Deactivate License Key"
											description="Are you sure you want to deactivate this license key? This will disable enterprise features."
											onClick={async () => {
												try {
													await deactivateLicenseKey();
													await utils.licenseKey.getEnterpriseSettings.invalidate();
													await utils.licenseKey.haveValidLicenseKey.invalidate();
													setLicenseKey("");
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
											disabled={isDeactivating || !haveValidLicenseKey}
										>
											<Button
												variant="destructive"
												disabled={isDeactivating || !haveValidLicenseKey}
												isLoading={isDeactivating}
											>
												Deactivate
											</Button>
										</DialogAction>
									)}
									{haveValidLicenseKey && (
										<Button
											variant="outline"
											disabled={
												isSaving || isCheckingLicenseKey || isDeactivating
											}
											isLoading={isValidating}
											onClick={async () => {
												try {
													const valid = await validateLicenseKey();
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
									)}
									{!haveValidLicenseKey && (
										<Button
											variant="secondary"
											disabled={
												isSaving ||
												isValidating ||
												isDeactivating ||
												!licenseKey.trim()
											}
											isLoading={isActivating}
											onClick={async () => {
												try {
													await activateLicenseKey({ licenseKey });
													await utils.licenseKey.getEnterpriseSettings.invalidate();
													await utils.licenseKey.haveValidLicenseKey.invalidate();
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
						</>
					) : (
						<div className="flex flex-col items-center gap-4 justify-center min-h-[30vh] text-center">
							<div className="flex flex-col items-center gap-2 max-w-[400px]">
								<div className="rounded-full bg-muted p-4">
									<ShieldCheck className="size-8 text-muted-foreground" />
								</div>
								<div className="space-y-1">
									<h3 className="text-lg font-semibold">Enterprise Features</h3>
									<p className="text-sm text-muted-foreground">
										Unlock advanced capabilities like SSO, Audit logs,
										whitelabeling and more.
									</p>
								</div>
							</div>

							<Button
								onClick={async () => {
									try {
										await updateEnterpriseSettings({
											enableEnterpriseFeatures: true,
										});
										await utils.licenseKey.getEnterpriseSettings.invalidate();
										toast.success("Enterprise features enabled");
									} catch (error) {
										console.error(error);
										toast.error("Failed to enable enterprise features");
									}
								}}
								isLoading={isSaving}
								disabled={isPending || isDeactivating}
							>
								Enable Enterprise Features
							</Button>
						</div>
					)}
				</>
			)}
		</div>
	);
}
