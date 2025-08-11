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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface Props {
	applicationId: string;
}

const AddRedirectSchema = z.object({
	command: z.string(),
});

type AddCommand = z.infer<typeof AddRedirectSchema>;

export const AddCommand = ({ applicationId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const utils = api.useUtils();

	const { mutateAsync, isLoading } = api.application.update.useMutation();

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
			applicationId,
			command: data?.command,
		})
			.then(async () => {
				toast.success(t("dashboard.command.commandUpdated"));
				await utils.application.one.invalidate({
					applicationId,
				});
			})
			.catch(() => {
				toast.error(t("dashboard.command.errorUpdatingCommand"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">
						{t("dashboard.command.runCommand")}
					</CardTitle>
					<CardDescription>
						{t("dashboard.command.description")}
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="command"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("dashboard.command.command")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("dashboard.command.commandPlaceholder")}
												{...field}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex justify-end">
							<Button isLoading={isLoading} type="submit" className="w-fit">
								{t("dashboard.command.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
