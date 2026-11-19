import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

interface Props {
	composeId: string;
}

const AddRedirectSchema = z.object({
	command: z.string(),
	pullImages: z.boolean(),
});

type AddCommand = z.infer<typeof AddRedirectSchema>;

export const AddCommandCompose = ({ composeId }: Props) => {
	const { t } = useTranslation();
	const { data } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);

	const { data: defaultCommand, refetch } =
		api.compose.getDefaultCommand.useQuery(
			{
				composeId,
			},
			{ enabled: !!composeId },
		);

	const utils = api.useUtils();

	const { mutateAsync, isPending } = api.compose.update.useMutation();

	const form = useForm<AddCommand>({
		defaultValues: {
			command: "",
			pullImages: false,
		},
		resolver: zodResolver(AddRedirectSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				command: data.command || "",
				pullImages: data.pullImages ?? false,
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (formData: AddCommand) => {
		await mutateAsync({
			composeId,
			command: formData.command,
			pullImages: formData.pullImages,
		})
			.then(async () => {
				toast.success(t("compose.commandUpdated"));
				refetch();
				await utils.compose.one.invalidate({
					composeId,
				});
			})
			.catch(() => {
				toast.error(t("compose.commandUpdateError"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">{t("compose.runCommand")}</CardTitle>
					<CardDescription>
						{t("compose.runCommandDescription")}
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<AlertBlock type="warning">
							{t("compose.runCommandWarning", { command: "docker" })}
						</AlertBlock>
						<div className="flex flex-col gap-4">
							{data?.composeType === "docker-compose" && (
								<FormField
									control={form.control}
									name="pullImages"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
											<div className="space-y-0.5">
												<FormLabel>{t("compose.pullLatestImages")}</FormLabel>
												<FormDescription>
													{t("compose.pullLatestImagesDescription")}
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
							)}
							<FormField
								control={form.control}
								name="command"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("compose.command")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("compose.commandPlaceholder")}
												{...field}
											/>
										</FormControl>

										<FormDescription>
											{t("compose.defaultCommand", {
												command: defaultCommand || "",
											})}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex justify-end">
							<Button isLoading={isPending} type="submit" className="w-fit">
								{t("compose.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
