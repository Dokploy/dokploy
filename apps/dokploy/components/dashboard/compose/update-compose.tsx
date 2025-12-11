import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const updateComposeSchema = (t: (key: string) => string) =>
	z.object({
		name: z.string().min(1, {
			message: t("compose.update.validation.nameRequired"),
		}),
		description: z.string().optional(),
	});

type UpdateCompose = z.infer<ReturnType<typeof updateComposeSchema>>;

interface Props {
	composeId: string;
}

export const UpdateCompose = ({ composeId }: Props) => {
	const { t } = useTranslation("common");
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isLoading } =
		api.compose.update.useMutation();
	const { data } = api.compose.one.useQuery(
		{
			composeId,
		},
		{
			enabled: !!composeId,
		},
	);
	const form = useForm<UpdateCompose>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(updateComposeSchema(t)),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateCompose) => {
		await mutateAsync({
			name: formData.name,
			composeId: composeId,
			description: formData.description || "",
		})
			.then(() => {
				toast.success(t("compose.update.success"));
				utils.compose.one.invalidate({
					composeId: composeId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("compose.update.error"));
			})
			.finally(() => {});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10 "
				>
					<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("compose.update.dialogTitle")}</DialogTitle>
					<DialogDescription>{t("compose.update.dialogDescription")}</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-compose"
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("compose.update.form.nameLabel")}</FormLabel>
											<FormControl>
												<Input placeholder={t("compose.update.form.namePlaceholder")} {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="description"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("compose.update.form.descriptionLabel")}</FormLabel>
											<FormControl>
												<Textarea
													placeholder={t("compose.update.form.descriptionPlaceholder")}
													className="resize-none"
													{...field}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								<DialogFooter>
									<Button
										isLoading={isLoading}
										form="hook-form-update-compose"
										type="submit"
									>
										{t("button.update")}
									</Button>
								</DialogFooter>
							</form>
						</Form>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
