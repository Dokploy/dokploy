import type {
	TelemetryProviderType,
	TelemetrySignal,
} from "@dokploy/server/services/logs-and-metrics/types";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { telemetryProviderIcons } from "@/components/icons/telemetry-provider-icons";
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
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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

const SIGNAL_OPTIONS: Array<{
	value: string;
	label: string;
	signals: TelemetrySignal[];
}> = [
	{ value: "logs", label: "Logs", signals: ["logs"] },
	{ value: "metrics", label: "Metrics", signals: ["metrics"] },
	{
		value: "logs,metrics",
		label: "Logs & Metrics",
		signals: ["logs", "metrics"],
	},
];

const providerForm = z.object({
	name: z.string().min(1, "Name is required"),
	providerType: z.string().min(1, "Provider is required"),
	signals: z.string().min(1, "Select what this provider sends"),
	enabled: z.boolean(),
	fields: z.record(z.string(), z.string().optional()),
});

type ProviderForm = z.infer<typeof providerForm>;

const toSignals = (value: string) =>
	SIGNAL_OPTIONS.find((option) => option.value === value)?.signals ?? [];

interface Props {
	telemetryProviderId?: string;
}

export const agentsUsingProvider = (
	targets:
		| Array<{
				name: string;
				telemetryProviderIds: string[];
		  }>
		| undefined,
	telemetryProviderId: string,
) =>
	(targets ?? [])
		.filter((target) =>
			target.telemetryProviderIds.includes(telemetryProviderId),
		)
		.map((target) => target.name)
		.join(", ");

export const HandleTelemetryProvider = ({ telemetryProviderId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [initialFields, setInitialFields] = useState<Record<string, string>>(
		{},
	);
	const [clearedKeys, setClearedKeys] = useState<Record<string, boolean>>({});

	const { data: availableTypes } =
		api.telemetryProvider.availableTypes.useQuery();
	const { data: provider } = api.telemetryProvider.one.useQuery(
		{ telemetryProviderId: telemetryProviderId || "" },
		{ enabled: !!telemetryProviderId, refetchOnWindowFocus: false },
	);

	const createMutation = api.telemetryProvider.create.useMutation();
	const updateMutation = api.telemetryProvider.update.useMutation();
	const {
		isPending: isSaving,
		error,
		isError,
	} = telemetryProviderId ? updateMutation : createMutation;
	const {
		mutateAsync: testConnection,
		isPending: isTestingRaw,
		error: testError,
		isError: testIsError,
	} = api.telemetryProvider.testConnection.useMutation();
	const {
		mutateAsync: testConnectionById,
		isPending: isTestingById,
		error: testByIdError,
		isError: testByIdIsError,
	} = api.telemetryProvider.testConnectionById.useMutation();

	const form = useForm<ProviderForm>({
		defaultValues: {
			name: "",
			providerType: "",
			signals: "",
			enabled: true,
			fields: {},
		},
		resolver: zodResolver(providerForm),
	});

	const providerType = form.watch("providerType");
	const signalsValue = form.watch("signals");
	const fieldValues = form.watch("fields");
	const signals = toSignals(signalsValue);

	const selectedType = availableTypes?.find((t) => t.type === providerType);
	const signalOptions = SIGNAL_OPTIONS.filter((option) =>
		option.signals.every((s) => selectedType?.signals.includes(s)),
	);
	const visibleFields = (selectedType?.credentialFields ?? []).filter(
		(field) => !field.signal || signals.includes(field.signal),
	);

	useEffect(() => {
		if (provider) {
			const extraConfig = (provider.extraConfig ?? {}) as Record<
				string,
				string
			>;
			form.reset({
				name: provider.name,
				providerType: provider.providerType,
				signals: provider.signals.join(","),
				enabled: provider.enabled,
				fields: extraConfig,
			});
			setInitialFields(extraConfig);
		} else {
			form.reset();
			setInitialFields({});
		}
		setClearedKeys({});
	}, [form, provider, isOpen]);

	const buildPayload = () => {
		const payload: {
			name: string;
			providerType: TelemetryProviderType;
			signals: TelemetrySignal[];
			enabled: boolean;
			endpoint?: string | null;
			apiKey?: string | null;
			apiSecret?: string | null;
			extraConfig?: Record<string, string>;
		} = {
			name: form.getValues("name"),
			providerType: providerType as TelemetryProviderType,
			signals,
			enabled: form.getValues("enabled"),
		};
		const extraConfig: Record<string, string> = {};
		let hasExtraConfigFields = false;
		for (const field of visibleFields) {
			const value = fieldValues[field.key] ?? "";
			if (
				field.key === "endpoint" ||
				field.key === "apiKey" ||
				field.key === "apiSecret"
			) {
				if (value) {
					payload[field.key] = value;
				} else if (clearedKeys[field.key]) {
					payload[field.key] = null;
				}
			} else {
				hasExtraConfigFields = true;
				extraConfig[field.key] = value;
			}
		}
		if (hasExtraConfigFields) {
			payload.extraConfig = extraConfig;
		}
		return payload;
	};

	// Required fields are per type and signal, so zod can't know them up front.
	const validateRequiredFields = () => {
		let valid = true;
		for (const field of visibleFields) {
			const value = fieldValues[field.key] ?? "";
			const keepsStored =
				!!telemetryProviderId &&
				TOP_LEVEL_KEYS.has(field.key) &&
				!clearedKeys[field.key];
			if (field.required && !value && !keepsStored) {
				form.setError(`fields.${field.key}`, {
					message: `${field.label} is required`,
				});
				valid = false;
			}
		}
		return valid;
	};

	const topLevelKeys = visibleFields
		.filter((field) => TOP_LEVEL_KEYS.has(field.key))
		.map((field) => field.key);
	const touchedTopLevelKeys = topLevelKeys.filter(
		(key) => !!fieldValues[key] || clearedKeys[key],
	);
	const touchedExtraConfigKeys = visibleFields
		.filter((field) => !TOP_LEVEL_KEYS.has(field.key))
		.map((field) => field.key)
		.filter((key) => (fieldValues[key] ?? "") !== (initialFields[key] ?? ""));
	const touchedAnyCredentialField =
		touchedTopLevelKeys.length > 0 || touchedExtraConfigKeys.length > 0;
	const isPartiallyTouched =
		!!telemetryProviderId &&
		touchedAnyCredentialField &&
		touchedTopLevelKeys.length < topLevelKeys.length;
	const signalsChanged =
		!!provider && signalsValue !== provider.signals.join(",");

	const showTestResult = (result: { warning?: string }) => {
		if (result.warning) {
			toast.message(result.warning);
		} else {
			toast.success("Connection tested successfully");
		}
	};

	const onTest = async () => {
		if (!(await form.trigger(["providerType", "signals"]))) return;
		if (telemetryProviderId && !touchedAnyCredentialField) {
			await testConnectionById({
				telemetryProviderId,
				...(signalsChanged ? { signals } : {}),
			})
				.then(showTestResult)
				.catch((e) => {
					toast.error(
						e instanceof Error ? e.message : "Connection test failed",
					);
				});
			return;
		}
		if (!validateRequiredFields()) return;
		await testConnection(buildPayload())
			.then(showTestResult)
			.catch((e) => {
				toast.error(e instanceof Error ? e.message : "Connection test failed");
			});
	};

	const onSubmit = async () => {
		if (!validateRequiredFields()) return;
		const payload = buildPayload();
		let warning: string | undefined;
		let reapplied = false;
		try {
			if (telemetryProviderId) {
				const result = await updateMutation.mutateAsync({
					telemetryProviderId,
					...payload,
				});
				warning = result.warning;
				reapplied = result.reapplied;
			} else {
				await createMutation.mutateAsync(payload);
			}
		} catch {
			toast.error(
				telemetryProviderId
					? "Error updating provider"
					: "Error adding provider",
			);
			return;
		}
		utils.telemetryProvider.all.invalidate();
		utils.telemetryProvider.serverStatus.invalidate();
		if (telemetryProviderId) {
			utils.telemetryProvider.one.invalidate({ telemetryProviderId });
		}
		const agents =
			telemetryProviderId &&
			agentsUsingProvider(
				utils.telemetryProvider.serverStatus.getData(),
				telemetryProviderId,
			);
		if (warning) {
			toast.warning("Provider updated", { description: warning });
		} else {
			toast.success(
				telemetryProviderId ? "Provider updated" : "Provider added",
				reapplied && agents
					? { description: `The Vector agent on ${agents} was re-applied.` }
					: undefined,
			);
		}
		setIsOpen(false);
	};

	const isTesting = isTestingRaw || isTestingById;

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{telemetryProviderId ? (
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
						Add provider
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{telemetryProviderId ? "Edit provider" : "Add a provider"}
					</DialogTitle>
					<DialogDescription>
						Vector ships container logs and host/container metrics from every
						server you deploy it on to this provider.
					</DialogDescription>
				</DialogHeader>
				{(isError || testIsError || testByIdIsError) && (
					<AlertBlock type="error" className="w-full">
						{testError?.message || testByIdError?.message || error?.message}
					</AlertBlock>
				)}

				<Form {...form}>
					<form
						id="hook-form-telemetry-provider"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="e.g. Production Loki" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="providerType"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Provider</FormLabel>
									<Select
										value={field.value}
										onValueChange={(value) => {
											field.onChange(value);
											form.setValue("signals", "");
											form.setValue("fields", {});
											form.clearErrors();
										}}
										disabled={!!telemetryProviderId}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a provider" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{availableTypes?.map((type) => {
												const ProviderIcon =
													telemetryProviderIcons[
														type.type as keyof typeof telemetryProviderIcons
													];
												return (
													<SelectItem key={type.type} value={type.type}>
														<div className="flex flex-row items-center gap-2">
															{ProviderIcon && (
																<ProviderIcon className="size-4 shrink-0" />
															)}
															{type.label}
														</div>
													</SelectItem>
												);
											})}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						{selectedType && (
							<FormField
								control={form.control}
								name="signals"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Sends</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select what this provider sends" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{signalOptions.map((option) => (
													<SelectItem key={option.value} value={option.value}>
														{option.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{visibleFields.map((credentialField) => (
							<FormField
								key={credentialField.key}
								control={form.control}
								name={`fields.${credentialField.key}`}
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{credentialField.label}
											{!credentialField.required && " (Optional)"}
										</FormLabel>
										{credentialField.helpText && (
											<FormDescription>
												{credentialField.helpText}
											</FormDescription>
										)}
										<div className="flex flex-row gap-2">
											<FormControl>
												<Input
													type={
														credentialField.type === "password"
															? "password"
															: "text"
													}
													disabled={!!clearedKeys[credentialField.key]}
													placeholder={
														clearedKeys[credentialField.key]
															? "Will be cleared on update"
															: telemetryProviderId &&
																	TOP_LEVEL_KEYS.has(credentialField.key)
																? "Leave blank to keep existing"
																: credentialField.placeholder
													}
													autoComplete={
														credentialField.type === "password"
															? "new-password"
															: "off"
													}
													{...field}
													value={field.value ?? ""}
												/>
											</FormControl>
											{telemetryProviderId &&
												TOP_LEVEL_KEYS.has(credentialField.key) &&
												!credentialField.required && (
													<Button
														type="button"
														variant="outline"
														onClick={() => {
															setClearedKeys((prev) => ({
																...prev,
																[credentialField.key]:
																	!prev[credentialField.key],
															}));
															field.onChange("");
														}}
													>
														{clearedKeys[credentialField.key]
															? "Keep"
															: "Clear"}
													</Button>
												)}
										</div>
										<FormMessage />
									</FormItem>
								)}
							/>
						))}

						<FormField
							control={form.control}
							name="enabled"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center gap-2 space-y-0">
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<FormLabel>Enabled</FormLabel>
								</FormItem>
							)}
						/>
					</form>
				</Form>

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
							type="submit"
							form="hook-form-telemetry-provider"
							isLoading={isSaving}
							disabled={isSaving}
						>
							{telemetryProviderId ? "Update" : "Create"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
