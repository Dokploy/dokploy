import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { api } from "@/utils/api";

interface Props {
	composeId: string;
}

const AddRedirectSchema = z.object({
	command: z.string(),
});

type AddCommand = z.infer<typeof AddRedirectSchema>;

export const AddCommandCompose = ({ composeId }: Props) => {
	const t = useTranslations("composeAdvanced");
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
		},
		resolver: zodResolver(AddRedirectSchema),
	});

	useEffect(() => {
		if (data?.command) {
			form.reset({
				command: data?.command || "",
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, data?.command]);

	const onSubmit = async (data: AddCommand) => {
		await mutateAsync({
			composeId,
			command: data?.command,
		})
			.then(async () => {
				toast.success(t("command.toastSuccess"));
				refetch();
				await utils.compose.one.invalidate({
					composeId,
				});
			})
			.catch(() => {
				toast.error(t("command.toastError"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">{t("command.title")}</CardTitle>
					<CardDescription>{t("command.description")}</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<AlertBlock type="warning">
							{t.rich("command.warning", {
								strong: (chunks) => <strong>{chunks}</strong>,
							})}
						</AlertBlock>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="command"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("fieldLabel")}</FormLabel>
										<FormControl>
											<Input placeholder={t("placeholder")} {...field} />
										</FormControl>

										<FormDescription>
											{t("defaultCommand", {
												command: defaultCommand ?? "",
											})}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex justify-end">
							<Button isLoading={isPending} type="submit" className="w-fit">
								{t("command.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
