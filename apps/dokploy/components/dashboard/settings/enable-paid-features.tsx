import { Card } from "@/components/ui/card";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { SparklesIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { SetupMonitoring } from "./servers/setup-monitoring";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

export const EnablePaidFeatures = () => {
	const { data, refetch } = api.user.get.useQuery();
	const [isLoading, setIsLoading] = useState(false);
	const { mutateAsync: saveLicense } = api.user.saveLicense.useMutation();
	const { mutateAsync: deactivateLicense } =
		api.user.deactivateLicense.useMutation();
	const { mutateAsync: validateLicense } =
		api.user.validateLicense.useMutation();
	const { mutateAsync: update } = api.user.update.useMutation();
	const [licenseKey, setLicenseKey] = useState("");

	useEffect(() => {
		if (data?.user?.enablePaidFeatures) {
			setLicenseKey(data.user.licenseKey || "");
		}
	}, [data?.user?.enablePaidFeatures]);

	const handleSaveLicense = async () => {
		if (!licenseKey) {
			toast.error("Please enter a license key");
			return;
		}
		setIsLoading(true);
		await saveLicense({
			licenseKey,
		})
			.then(() => {
				toast.success("License validated successfully");
			})
			.catch((e) => {
				toast.error("Error validating license", {
					description: e.message,
				});
			})
			.finally(() => {
				setIsLoading(false);
			});

		refetch();
	};

	const handleValidateLicense = async () => {
		if (!licenseKey) {
			toast.error("Please enter a license key");
			return;
		}
		setIsLoading(true);
		await validateLicense({
			licenseKey,
		})
			.then(() => {
				toast.success("License validated successfully");
			})
			.catch((e) => {
				toast.error("Error validating license", {
					description: e.message,
				});
			})
			.finally(() => {
				setIsLoading(false);
			});
	};

	return (
		<Card className="h-full bg-sidebar p-2.5 rounded-xl">
			<div className="rounded-xl bg-background shadow-md">
				<CardHeader>
					<CardTitle className="text-xl flex flex-row items-center gap-3">
						<div className="p-2 rounded-lg bg-primary/10">
							<SparklesIcon className="size-5 text-primary" />
						</div>
						Paid Features
					</CardTitle>
					<CardDescription className="mt-2">
						Unlock advanced capabilities like monitoring and enhanced
						performance tracking
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="flex flex-col gap-6">
						<div className="flex flex-row items-center justify-between p-4 border rounded-lg bg-card/50 hover:bg-card/80 transition-colors">
							<div className="space-y-1">
								<h3 className="font-medium">Enable Premium Features</h3>
								<p className="text-sm text-muted-foreground">
									Access advanced monitoring tools and premium capabilities
								</p>
							</div>
							<Switch
								className="ml-4"
								checked={data?.user?.enablePaidFeatures}
								onCheckedChange={() => {
									update({
										enablePaidFeatures: !data?.user?.enablePaidFeatures,
									})
										.then(() => {
											toast.success(
												`Premium features ${
													data?.user?.enablePaidFeatures
														? "disabled"
														: "enabled"
												} successfully`,
											);
											refetch();
										})
										.catch(() => {
											toast.error("Error updating premium features");
										});
								}}
							/>
						</div>

						{data?.user?.enablePaidFeatures && (
							<div className="flex flex-row items-center gap-4 p-4 border rounded-lg bg-card/50">
								<div className="flex-grow">
									<Input
										placeholder="Enter your license key"
										value={licenseKey}
										disabled={data?.user?.licenseKey !== null}
										onChange={(e) => setLicenseKey(e.target.value)}
										className="w-full"
									/>
								</div>
								{!data?.user?.licenseKey ? (
									<Button
										onClick={handleSaveLicense}
										variant="secondary"
										disabled={isLoading}
									>
										{isLoading ? "Saving..." : "Save License"}
									</Button>
								) : (
									<div className="flex gap-2">
										<Button
											onClick={handleValidateLicense}
											variant="secondary"
											disabled={isLoading}
										>
											{isLoading ? "Validating..." : "Validate"}
										</Button>
										<Button
											onClick={() => {
												setIsLoading(true);
												deactivateLicense({
													licenseKey,
												})
													.then(() => {
														setLicenseKey("");
														toast.success("License removed successfully");
														refetch();
													})
													.catch((e) => {
														toast.error("Error removing license", {
															description: e.message,
														});
													})
													.finally(() => {
														setIsLoading(false);
													});
											}}
											variant="destructive"
											disabled={isLoading}
										>
											Remove
										</Button>
									</div>
								)}
							</div>
						)}
					</div>
				</CardContent>
				{data?.user?.enablePaidFeatures && <SetupMonitoring />}
			</div>
		</Card>
	);
};
