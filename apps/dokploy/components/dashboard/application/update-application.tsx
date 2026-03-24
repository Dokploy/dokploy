import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
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

const createUpdateApplicationSchema = (
	t: ReturnType<typeof useTranslations<"applicationGeneralMain">>,
) =>
	z.object({
		name: z.string().min(1, {
			message: t("editApplication.validation.nameRequired"),
		}),
		description: z.string().optional(),
	});

type UpdateApplicationForm = z.infer<
	ReturnType<typeof createUpdateApplicationSchema>
>;

interface Props {
	applicationId: string;
}

export const UpdateApplication = ({ applicationId }: Props) => {
	const t = useTranslations("applicationGeneralMain");
	const updateApplicationSchema = useMemo(
		() => createUpdateApplicationSchema(t),
		[t],
	);

	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isPending } =
		api.application.update.useMutation();
	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);
	const form = useForm<UpdateApplicationForm>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(updateApplicationSchema),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateApplicationForm) => {
		await mutateAsync({
			name: formData.name,
			applicationId: applicationId,
			description: formData.description || "",
		})
			.then(() => {
				toast.success(t("editApplication.toastSuccess"));
				utils.application.one.invalidate({
					applicationId: applicationId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("editApplication.toastError"));
			});
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
					<DialogTitle>{t("editApplication.dialogTitle")}</DialogTitle>
					<DialogDescription>
						{t("editApplication.dialogDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-application"
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("editApplication.nameLabel")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("editApplication.namePlaceholder")}
													{...field}
												/>
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
											<FormLabel>
												{t("editApplication.descriptionLabel")}
											</FormLabel>
											<FormControl>
												<Textarea
													placeholder={t(
														"editApplication.descriptionPlaceholder",
													)}
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
										isLoading={isPending}
										form="hook-form-update-application"
										type="submit"
									>
										{t("editApplication.submit")}
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
