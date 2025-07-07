"use client";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { type TFunction, useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const createSchema = (t: TFunction) =>
	z.object({
		name: z.string().min(1, { message: t("settings.ai.nameRequired") }),
		apiUrl: z.string().url({ message: t("settings.ai.apiUrlRequired") }),
		apiKey: z.string().min(1, { message: t("settings.ai.apiKeyRequired") }),
		model: z.string().min(1, { message: t("settings.ai.modelRequired") }),
		isEnabled: z.boolean(),
	});

type Schema = z.infer<ReturnType<typeof createSchema>>;

interface Props {
	aiId?: string;
}

export const HandleAi = ({ aiId }: Props) => {
	const { t } = useTranslation("settings");
	const utils = api.useUtils();
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
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

	const form = useForm<Schema>({
		resolver: zodResolver(createSchema(t)),
		defaultValues: {
			name: "",
			apiUrl: "",
			apiKey: "",
			model: "gpt-3.5-turbo",
			isEnabled: true,
		},
	});

	useEffect(() => {
		form.reset({
			name: data?.name ?? "",
			apiUrl: data?.apiUrl ?? "https://api.openai.com/v1",
			apiKey: data?.apiKey ?? "",
			model: data?.model ?? "gpt-3.5-turbo",
			isEnabled: data?.isEnabled ?? true,
		});
	}, [aiId, form, data]);

	const apiUrl = form.watch("apiUrl");
	const apiKey = form.watch("apiKey");

	const { data: models, isLoading: isLoadingServerModels } =
		api.ai.getModels.useQuery(
			{
				apiUrl: apiUrl ?? "",
				apiKey: apiKey ?? "",
			},
			{
				enabled: !!apiUrl && !!apiKey,
				onError: (error) => {
					setError(`${t("settings.ai.failedToFetchModels")} ${error.message}`);
				},
			},
		);

	useEffect(() => {
		const apiUrl = form.watch("apiUrl");
		const apiKey = form.watch("apiKey");
		if (apiUrl && apiKey) {
			form.setValue("model", "");
		}
	}, [form.watch("apiUrl"), form.watch("apiKey")]);

	const onSubmit = async (data: Schema) => {
		try {
			await mutateAsync({
				...data,
				aiId: aiId || "",
			});

			utils.ai.getAll.invalidate();
			toast.success(t("settings.ai.savedSuccessfully"));
			refetch();
			setOpen(false);
		} catch (error) {
			toast.error(t("settings.ai.failedToSave"), {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
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
						{t("settings.ai.add")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{aiId ? t("settings.ai.edit") : t("settings.ai.add")}
					</DialogTitle>
					<DialogDescription>
						{t("settings.ai.configureDescription")}
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
									<FormLabel>{t("settings.ai.name")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("settings.ai.namePlaceholder")}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										{t("settings.ai.nameDescription")}
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
									<FormLabel>{t("settings.ai.apiUrl")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("settings.ai.apiUrlPlaceholder")}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										{t("settings.ai.apiUrlDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="apiKey"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("settings.ai.apiKey")}</FormLabel>
									<FormControl>
										<Input
											type="password"
											placeholder={t("settings.ai.apiKeyPlaceholder")}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										{t("settings.ai.apiKeyDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{isLoadingServerModels && (
							<span className="text-sm text-muted-foreground">
								{t("settings.ai.loadingModels")}
							</span>
						)}

						{!isLoadingServerModels && models && models.length > 0 && (
							<FormField
								control={form.control}
								name="model"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.ai.model")}</FormLabel>
										<Select
											onValueChange={field.onChange}
											value={field.value || ""}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue
														placeholder={t("settings.ai.modelPlaceholder")}
													/>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{models.map((model) => (
													<SelectItem key={model.id} value={model.id}>
														{model.id}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormDescription>
											{t("settings.ai.modelDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<FormField
							control={form.control}
							name="isEnabled"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-0.5">
										<FormLabel className="text-base">
											{t("settings.ai.enableFeatures")}
										</FormLabel>
										<FormDescription>
											{t("settings.ai.enableFeaturesDescription")}
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
								{aiId
									? t("settings.common.update")
									: t("settings.common.create")}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
