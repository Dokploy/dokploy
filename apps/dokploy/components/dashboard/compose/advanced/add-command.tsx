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
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface Props {
	composeId: string;
}

const schema = z.object({
	command: z.string(),
});

type AddCommand = z.infer<typeof schema>;

export const AddCommandCompose = ({ composeId }: Props) => {
	const { t } = useTranslation("dashboard");
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

	const { mutateAsync, isLoading } = api.compose.update.useMutation();

	const form = useForm<AddCommand>({
		defaultValues: {
			command: "",
		},
		resolver: zodResolver(schema),
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
				toast.success(t("dashboard.compose.commandUpdated"));
				refetch();
				await utils.compose.one.invalidate({
					composeId,
				});
			})
			.catch(() => {
				toast.error(t("dashboard.compose.errorUpdatingCommand"));
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between">
				<div>
					<CardTitle className="text-xl">
						{t("dashboard.compose.runCommand")}
					</CardTitle>
					<CardDescription>
						{t("dashboard.compose.runCommandDescription")}
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
							{t("dashboard.compose.modifyingDefaultCommandWarning")}
						</AlertBlock>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="command"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("dashboard.compose.command")}</FormLabel>
										<FormControl>
											<Input
												placeholder={t("dashboard.compose.customCommand")}
												{...field}
											/>
										</FormControl>

										<FormDescription>
											{t("dashboard.compose.defaultCommand", {
												defaultCommand,
											})}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex justify-end">
							<Button isLoading={isLoading} type="submit" className="w-fit">
								{t("dashboard.compose.save")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
