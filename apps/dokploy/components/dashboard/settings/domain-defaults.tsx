import { GlobeLockIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

type CertificateType = "letsencrypt" | "none" | "custom";

export const DomainDefaults = () => {
	const { data, refetch } = api.settings.getDomainDefaults.useQuery();
	const { mutateAsync, isPending } =
		api.settings.updateDomainDefaults.useMutation();

	const [https, setHttps] = useState(false);
	const [certificateType, setCertificateType] =
		useState<CertificateType>("none");

	useEffect(() => {
		if (data) {
			setHttps(data.https);
			setCertificateType(data.certificateType);
		}
	}, [data]);

	const hasChanges =
		!!data &&
		(https !== data.https || certificateType !== data.certificateType);

	const handleSave = async () => {
		try {
			await mutateAsync({
				defaultDomainHttps: https,
				defaultDomainCertificateType: certificateType,
			});
			await refetch();
			toast.success("Domain defaults updated");
		} catch {
			toast.error("Error updating domain defaults");
		}
	};

	return (
		<Card className="h-full bg-sidebar p-2.5 rounded-xl w-full mx-auto">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader>
					<CardTitle className="text-xl flex flex-row gap-2">
						<GlobeLockIcon className="size-6 text-muted-foreground self-center" />
						Domain Defaults
					</CardTitle>
					<CardDescription>
						Initial HTTPS settings for domains added to applications and compose
						services. Existing domains are not affected.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 py-6 border-t">
					<div className="flex flex-row items-center justify-between p-3 border rounded-lg shadow-xs">
						<div className="space-y-0.5">
							<Label>HTTPS</Label>
							<p className="text-sm text-muted-foreground">
								Enable HTTPS on new domains.
							</p>
						</div>
						<Switch checked={https} onCheckedChange={setHttps} />
					</div>

					{https && (
						<div className="flex flex-col gap-2">
							<Label>Certificate Provider</Label>
							<Select
								value={certificateType}
								onValueChange={(value) =>
									setCertificateType(value as CertificateType)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a certificate provider" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">None</SelectItem>
									<SelectItem value="letsencrypt">Let's Encrypt</SelectItem>
									<SelectItem value="custom">Custom</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="flex justify-end">
						<Button
							type="button"
							onClick={handleSave}
							isLoading={isPending}
							disabled={!hasChanges}
						>
							Save
						</Button>
					</div>
				</CardContent>
			</div>
		</Card>
	);
};
