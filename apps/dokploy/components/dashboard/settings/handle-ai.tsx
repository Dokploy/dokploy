"use client";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Check, ChevronDown, PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

const Schema = z.object({
	name: z.string().min(1, { message: "Name is required" }),
	apiUrl: z.string().url({ message: "Please enter a valid URL" }),
	apiKey: z.string(),
	model: z.string().min(1, { message: "Model is required" }),
	isEnabled: z.boolean(),
});

type Schema = z.infer<typeof Schema>;

interface Props {
	aiId?: string;
}

export const HandleAi = ({ aiId }: Props) => {
	const utils = api.useUtils();
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
	const { mutateAsync, isPending } = aiId
		? api.ai.update.useMutation()
		: api.ai.create.useMutation();

	const form = useForm<Schema>({
		resolver: zodResolver(Schema),
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
	const {
		data: models,
		isPending: isLoadingServerModels,
		error: modelsError,
	} = api.ai.getModels.useQuery(
		{
			apiUrl: apiUrl ?? "",
			apiKey: apiKey ?? "",
		},
		{
			enabled: !!apiUrl && (isOllama || !!apiKey),
		},
	);

	const onSubmit = async (data: Schema) => {
		try {
			await mutateAsync({
				...data,
				aiId: aiId || "",
			});

			utils.ai.getAll.invalidate();
			toast.success("AI settings saved successfully");
			refetch();
			setOpen(false);
		} catch (error) {
			toast.error("Failed to save AI settings", {
				description: error instanceof Error ? error.message : "Unknown error",
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
						Add AI
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{aiId ? "Edit AI" : "Add AI"}</DialogTitle>
					<DialogDescription>
						Configure your AI provider settings
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					{modelsError && (
						<AlertBlock type="error">{modelsError.message}</AlertBlock>
					)}
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="My OpenAI Config" {...field} />
									</FormControl>
									<FormDescription>
										A name to identify this configuration
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
									<FormLabel>API URL</FormLabel>
									<FormControl>
										<Input
											placeholder="https://api.openai.com/v1"
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
										The base URL for your AI provider's API
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
										<FormLabel>API Key</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder="sk-..."
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
											Your API key for authentication
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{isLoadingServerModels && (
							<span className="text-sm text-muted-foreground">
								Loading models...
							</span>
						)}

						{!isLoadingServerModels && !models?.length && (
							<span className="text-sm text-muted-foreground">
								No models available
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
											<FormLabel>Model</FormLabel>
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
																: "Select a model"}
															<ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
														</Button>
													</FormControl>
												</PopoverTrigger>
												<PopoverContent className="w-[400px] p-0" align="start">
													<Command>
														<CommandInput
															placeholder="Search models..."
															value={modelSearch}
															onValueChange={setModelSearch}
														/>
														<CommandList>
															<CommandEmpty>No models found.</CommandEmpty>
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
												Select an AI model to use
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
											Enable AI Features
										</FormLabel>
										<FormDescription>
											Turn on/off AI functionality
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
							<Button type="submit" isLoading={isPending}>
								{aiId ? "Update" : "Create"}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
