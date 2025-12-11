"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronDown, PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useTranslation } from "next-i18next";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const aiSchema = z.object({
	name: z.string().min(1),
	apiUrl: z.string().url(),
	apiKey: z.string(),
	model: z.string().min(1),
	isEnabled: z.boolean(),
});

const createAiSchema = (t: (key: string) => string) =>
	aiSchema.extend({
		name: aiSchema.shape.name.min(1, {
			message: t("settings.ai.validation.nameRequired"),
		}),
		apiUrl: aiSchema.shape.apiUrl.url({
			message: t("settings.ai.validation.apiUrlInvalid"),
		}),
		model: aiSchema.shape.model.min(1, {
			message: t("settings.ai.validation.modelRequired"),
		}),
	});

type Schema = z.infer<typeof aiSchema>;

interface Props {
	aiId?: string;
}

export const HandleAi = ({ aiId }: Props) => {
	const { t } = useTranslation("settings");
	const utils = api.useUtils();
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
	const [modelSearch, setModelSearch] = useState("");
	const { data, refetch } = api.ai.one.useQuery(
		{
			aiId: aiId || "",
		},
		{
			enabled: !!aiId,
		},
	);
	const { mutateAsync, isLoading } = aiId
		? api.ai.update.useMutation()
		: api.ai.create.useMutation();

	const schema = createAiSchema(t);

	const form = useForm<Schema>({
		resolver: zodResolver(schema),
		defaultValues: {
			name: "",
			apiUrl: "",
			apiKey: "",
			model: "",
			isEnabled: true,
		},
	});

	useEffect(() => {
		if (data) {
			form.reset({
				name: data?.name ?? "",
				apiUrl: data?.apiUrl ?? "https://api.openai.com/v1",
				apiKey: data?.apiKey ?? "",
				model: data?.model ?? "",
				isEnabled: data?.isEnabled ?? true,
			});
		}
		setModelSearch("");
		setModelPopoverOpen(false);
	}, [aiId, form, data]);

	const apiUrl = form.watch("apiUrl");
	const apiKey = form.watch("apiKey");

	const isOllama = apiUrl.includes(":11434") || apiUrl.includes("ollama");
	const { data: models, isLoading: isLoadingServerModels } =
		api.ai.getModels.useQuery(
			{
				apiUrl: apiUrl ?? "",
				apiKey: apiKey ?? "",
			},
			{
				enabled: !!apiUrl && (isOllama || !!apiKey),
				onError: (error) => {
					setError(`Failed to fetch models: ${error.message}`);
				},
			},
		);

	const onSubmit = async (data: Schema) => {
		try {
			await mutateAsync({
				...data,
				aiId: aiId || "",
			});

			utils.ai.getAll.invalidate();
			toast.success(t("settings.ai.toast.saveSuccess"));
			refetch();
			setOpen(false);
		} catch (error) {
			toast.error(t("settings.ai.toast.saveError"), {
				description:
					error instanceof Error
							? error.message
							: t("settings.ai.toast.unknownError"),
			});
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				setOpen(isOpen);
				if (!isOpen) {
					setModelSearch("");
					setModelPopoverOpen(false);
				}
			}}
		>
			<DialogTrigger className="" asChild>
				{aiId ? (
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
						{t("settings.ai.form.add")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{aiId ? t("settings.ai.form.editTitle") : t("settings.ai.form.addTitle")} 
					</DialogTitle>
					<DialogDescription>
						{t("settings.ai.form.description")}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					{error && <AlertBlock type="error">{error}</AlertBlock>}
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("settings.ai.form.name.label")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t("settings.ai.form.name.placeholder")}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										{t("settings.ai.form.name.description")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="apiUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("settings.ai.form.apiUrl.label")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t("settings.ai.form.apiUrl.placeholder")}
											{...field}
											onChange={(e) => {
												field.onChange(e);
												// Reset model when user changes API URL
												if (form.getValues("model")) {
													form.setValue("model", "");
												}
											}}
										/>
									</FormControl>
									<FormDescription>
										{t("settings.ai.form.apiUrl.description")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{!isOllama && (
							<FormField
								control={form.control}
								name="apiKey"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.ai.form.apiKey.label")}
										</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder={t("settings.ai.form.apiKey.placeholder")}
												autoComplete="one-time-code"
												{...field}
												onChange={(e) => {
													field.onChange(e);
													// Reset model when user changes API Key
													if (form.getValues("model")) {
														form.setValue("model", "");
													}
												}}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.ai.form.apiKey.description")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{isLoadingServerModels && (
							<span className="text-sm text-muted-foreground">
								{t("settings.ai.models.loading")}
							</span>
						)}

						{!isLoadingServerModels && !models?.length && (
							<span className="text-sm text-muted-foreground">
								{t("settings.ai.models.empty")}
							</span>
						)}

						{!isLoadingServerModels && models && models.length > 0 && (
							<FormField
								control={form.control}
								name="model"
								render={({ field }) => {
									const selectedModel = models.find(
										(m) => m.id === field.value,
									);
									const filteredModels = models.filter((model) =>
										model.id.toLowerCase().includes(modelSearch.toLowerCase()),
									);

									// Ensure selected model is always in the filtered list
									const displayModels =
										field.value &&
										!filteredModels.find((m) => m.id === field.value) &&
										selectedModel
											? [selectedModel, ...filteredModels]
											: filteredModels;

									return (
										<FormItem>
											<FormLabel>
												{t("settings.ai.form.model.label")}
											</FormLabel>
											<Popover
												open={modelPopoverOpen}
												onOpenChange={setModelPopoverOpen}
											>
												<PopoverTrigger asChild>
													<FormControl>
														<Button
															variant="outline"
															className={cn(
																"w-full justify-between",
																!field.value && "text-muted-foreground",
															)}
														>
															{field.value
																? (selectedModel?.id ?? field.value)
																: t("settings.ai.form.model.placeholder")}
															<ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
														</Button>
													</FormControl>
												</PopoverTrigger>
												<PopoverContent className="w-[400px] p-0" align="start">
													<Command>
														<CommandInput
															placeholder={t("settings.ai.form.model.searchPlaceholder")}
															value={modelSearch}
															onValueChange={setModelSearch}
														/>
														<CommandList>
															<CommandEmpty>
																{t("settings.ai.models.notFound")}
															</CommandEmpty>
															{displayModels.map((model) => {
																const isSelected = field.value === model.id;
																return (
																	<CommandItem
																		key={model.id}
																		value={model.id}
																		onSelect={() => {
																			field.onChange(model.id);
																			setModelPopoverOpen(false);
																			setModelSearch("");
																		}}
																	>
																		<Check
																			className={cn(
																				"mr-2 h-4 w-4",
																				isSelected
																					? "opacity-100"
																					: "opacity-0",
																			)}
																		/>
																		{model.id}
																	</CommandItem>
																);
															})}
														</CommandList>
													</Command>
												</PopoverContent>
											</Popover>
											<FormDescription>
												{t("settings.ai.form.model.description")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
						)}

						<FormField
							control={form.control}
							name="isEnabled"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-0.5">
										<FormLabel className="text-base">
											{t("settings.ai.form.isEnabled.label")}
										</FormLabel>
										<FormDescription>
											{t("settings.ai.form.isEnabled.description")}
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						<div className="flex justify-end  gap-2 pt-4">
							<Button type="submit" isLoading={isLoading}>
								{aiId ? t("settings.common.update") : t("settings.common.create")}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
