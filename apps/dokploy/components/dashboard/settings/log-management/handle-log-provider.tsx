import type { LogProviderType } from "@dokploy/server/services/log-management/types";
import { AlertTriangle, PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
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

const TOP_LEVEL_KEYS = new Set(["endpoint", "apiKey", "apiSecret"]);

interface Props {
	logProviderId?: string;
}

export const HandleLogProvider = ({ logProviderId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [name, setName] = useState("");
	const [providerType, setProviderType] = useState("");
	const [enabled, setEnabled] = useState(true);
	const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
	const [initialFieldValues, setInitialFieldValues] = useState<
		Record<string, string>
	>({});

	const { data: availableTypes } = api.logProvider.availableTypes.useQuery();
	const { data: provider } = api.logProvider.one.useQuery(
		{ logProviderId: logProviderId || "" },
		{ enabled: !!logProviderId },
	);

	const {
		mutateAsync,
		isPending: isSaving,
		error,
		isError,
	} = logProviderId
		? api.logProvider.update.useMutation()
		: api.logProvider.create.useMutation();
	const {
		mutateAsync: testConnection,
		isPending: isTestingRaw,
		error: testError,
		isError: testIsError,
	} = api.logProvider.testConnection.useMutation();
	const {
		mutateAsync: testConnectionById,
		isPending: isTestingById,
		error: testByIdError,
		isError: testByIdIsError,
	} = api.logProvider.testConnectionById.useMutation();

	const selectedType = availableTypes?.find((t) => t.type === providerType);

	const handleProviderTypeChange = (value: string) => {
		setProviderType(value);
		setFieldValues({});
	};

	useEffect(() => {
		if (provider) {
			setName(provider.name);
			setProviderType(provider.providerType);
			setEnabled(provider.enabled);
			const extraConfig = (provider.extraConfig ?? {}) as Record<
				string,
				string
			>;
			setFieldValues(extraConfig);
			setInitialFieldValues(extraConfig);
		} else if (isOpen) {
			setName("");
			setProviderType("");
			setEnabled(true);
			setFieldValues({});
			setInitialFieldValues({});
		}
	}, [provider, isOpen]);

	const buildPayload = () => {
		const payload: Record<string, unknown> = { name, providerType, enabled };
		const extraConfig: Record<string, string> = {};
		let hasExtraConfigFields = false;
		for (const field of selectedType?.credentialFields ?? []) {
			const value = fieldValues[field.key];
			if (TOP_LEVEL_KEYS.has(field.key)) {
				if (value) {
					payload[field.key] = value;
				}
			} else {
				hasExtraConfigFields = true;
				extraConfig[field.key] = value ?? "";
			}
		}
		if (hasExtraConfigFields) {
			payload.extraConfig = extraConfig;
		}
		return payload;
	};

	const topLevelKeys = (selectedType?.credentialFields ?? [])
		.filter((field) => TOP_LEVEL_KEYS.has(field.key))
		.map((field) => field.key);
	const touchedTopLevelKeys = topLevelKeys.filter((key) => !!fieldValues[key]);
	const extraConfigKeys = (selectedType?.credentialFields ?? [])
		.filter((field) => !TOP_LEVEL_KEYS.has(field.key))
		.map((field) => field.key);
	const touchedExtraConfigKeys = extraConfigKeys.filter(
		(key) => (fieldValues[key] ?? "") !== (initialFieldValues[key] ?? ""),
	);
	const touchedAnyCredentialField =
		touchedTopLevelKeys.length > 0 || touchedExtraConfigKeys.length > 0;
	const isPartiallyTouched =
		!!logProviderId &&
		touchedAnyCredentialField &&
		touchedTopLevelKeys.length < topLevelKeys.length;

	const onTest = async () => {
		if (logProviderId && !touchedAnyCredentialField) {
			await testConnectionById({ logProviderId })
				.then((result) => {
					if (result.warning) {
						toast.message(result.warning);
					} else {
						toast.success("Connection tested successfully");
					}
				})
				.catch((e) => {
					toast.error(
						e instanceof Error ? e.message : "Connection test failed",
					);
				});
			return;
		}
		const payload = buildPayload();
		await testConnection({
			name: payload.name as string,
			providerType: payload.providerType as LogProviderType,
			enabled: payload.enabled as boolean,
			endpoint: (payload.endpoint as string) ?? null,
			apiKey: (payload.apiKey as string) ?? null,
			apiSecret: (payload.apiSecret as string) ?? null,
			extraConfig: (payload.extraConfig as Record<string, unknown>) ?? null,
		})
			.then((result) => {
				if (result.warning) {
					toast.message(result.warning);
				} else {
					toast.success("Connection tested successfully");
				}
			})
			.catch((e) => {
				toast.error(e instanceof Error ? e.message : "Connection test failed");
			});
	};

	const onSubmit = async () => {
		const payload = buildPayload();
		await mutateAsync({
			...(logProviderId ? { logProviderId } : {}),
			...payload,
		} as any)
			.then((result: any) => {
				utils.logProvider.all.invalidate();
				toast.success(
					logProviderId ? "Log provider updated" : "Log provider added",
				);
				if (result?.syncErrors && result.syncErrors.length > 0) {
					toast.error(
						`Failed to sync ${result.syncErrors.length} server(s) — they may still be shipping with the old config`,
					);
				}
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					logProviderId
						? "Error updating log provider"
						: "Error adding log provider",
				);
			});
	};

	const isTesting = isTestingRaw || isTestingById;

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{logProviderId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 "
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						Add Log Provider
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{logProviderId ? "Edit Log Provider" : "Add a Log Provider"}
					</DialogTitle>
					<DialogDescription>
						Vector will ship container logs from every server with Log
						Management enabled to this provider.
					</DialogDescription>
				</DialogHeader>
				{(isError || testIsError || testByIdIsError) && (
					<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{testError?.message ||
								testByIdError?.message ||
								error?.message ||
								""}
						</span>
					</div>
				)}
				<div className="grid grid-cols-1 sm:grid-cols-2 w-full gap-4">
					<div className="flex flex-col gap-2">
						<Label>Name</Label>
						<Input
							placeholder="e.g. Production Loki"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Provider</Label>
						<Select
							value={providerType}
							onValueChange={handleProviderTypeChange}
							disabled={!!logProviderId}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select a provider" />
							</SelectTrigger>
							<SelectContent>
								{availableTypes?.map((type) => (
									<SelectItem key={type.type} value={type.type}>
										{type.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{selectedType?.credentialFields.map((field) => (
						<div
							key={field.key}
							className={
								field.type === "url" || field.fullWidth
									? "flex flex-col gap-2 col-span-2"
									: "flex flex-col gap-2"
							}
						>
							<Label>
								{field.label}
								{!field.required && " (Optional)"}
							</Label>
							{field.helpText && (
								<span className="text-xs text-muted-foreground">
									{field.helpText}
								</span>
							)}
							<Input
								type={field.type === "password" ? "password" : "text"}
								placeholder={
									logProviderId && TOP_LEVEL_KEYS.has(field.key)
										? "Leave blank to keep existing"
										: field.placeholder
								}
								autoComplete={
									field.type === "password" ? "one-time-code" : "off"
								}
								value={fieldValues[field.key] ?? ""}
								onChange={(e) =>
									setFieldValues((prev) => ({
										...prev,
										[field.key]: e.target.value,
									}))
								}
							/>
						</div>
					))}

					<div className="flex flex-row items-center gap-2 col-span-2">
						<Switch checked={enabled} onCheckedChange={setEnabled} />
						<Label>Enabled</Label>
					</div>
				</div>

				<DialogFooter className="flex flex-col w-full sm:justify-between gap-4 flex-wrap sm:flex-col">
					{isPartiallyTouched && (
						<span className="text-xs text-muted-foreground">
							You changed something that needs a fresh credential to test — fill
							in every credential field to test with the new values, or revert
							it to test with what's already saved.
						</span>
					)}
					<div className="flex flex-row gap-2 justify-between">
						<Button
							type="button"
							variant="secondary"
							isLoading={isTesting}
							disabled={!providerType || isPartiallyTouched}
							onClick={onTest}
						>
							Test connection
						</Button>
						<Button
							onClick={onSubmit}
							isLoading={isSaving}
							disabled={!providerType || !name || isSaving}
						>
							{logProviderId ? "Update" : "Create"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
