import { Key } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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

	const [licenseKey, setLicenseKey] = useState("");

	useEffect(() => {
		if (data?.licenseKey !== undefined) {
			setLicenseKey(data.licenseKey ?? "");
		}
	}, [data?.licenseKey]);

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
							disabled={isLoading || isSaving}
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
					<div className="md:justify-self-end">
						<Button
							variant="secondary"
							disabled={isSaving}
							onClick={async () => {
								try {
									await updateEnterpriseSettings({ licenseKey });
									await utils.licenseKey.getEnterpriseSettings.invalidate();
									toast.success("License key saved");
								} catch (error) {
									console.error(error);
									toast.error("Failed to save license key");
								}
							}}
						>
							Save
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
