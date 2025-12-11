import { zodResolver } from "@hookform/resolvers/zod";
import { PenBox } from "lucide-react";
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

const createUpdatePostgresSchema = (t: (key: string) => string) =>
	z.object({
		name: z.string().min(1, {
			message: t("service.validation.nameRequired"),
		}),
		description: z.string().optional(),
	});

type UpdatePostgres = z.infer<ReturnType<typeof createUpdatePostgresSchema>>;

interface Props {
	postgresId: string;
}

export const UpdatePostgres = ({ postgresId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { t } = useTranslation("common");
	const { mutateAsync, error, isError, isLoading } =
		api.postgres.update.useMutation();
	const { data } = api.postgres.one.useQuery(
		{
			postgresId,
		},
		{
			enabled: !!postgresId,
		},
	);
	const form = useForm<UpdatePostgres>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(createUpdatePostgresSchema(t)),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdatePostgres) => {
		await mutateAsync({
			name: formData.name,
			postgresId: postgresId,
			description: formData.description || "",
		})
			.then(() => {
				toast.success(t("database.postgres.update.success"));
				utils.postgres.one.invalidate({
					postgresId: postgresId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("database.postgres.update.error"));
			})
			.finally(() => {});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10 focus-visible:ring-2 focus-visible:ring-offset-2"
				>
					<PenBox className="size-3.5 text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{t("database.postgres.update.dialogTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("database.postgres.update.dialogDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-postgres"
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("service.form.name")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("service.form.namePlaceholder")}
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
											<FormLabel>{t("service.form.description")}</FormLabel>
											<FormControl>
												<Textarea
													placeholder={t("service.form.descriptionPlaceholder")}
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
										form="hook-form-update-postgres"
										type="submit"
										className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
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
