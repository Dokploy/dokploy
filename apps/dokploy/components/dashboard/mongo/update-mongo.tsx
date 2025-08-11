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
import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const createUpdateMongoSchema = (t: any) =>
	z.object({
		name: z.string().min(1, {
			message: t("dashboard.mongo.nameRequired"),
		}),
		description: z.string().optional(),
	});

type UpdateMongo = z.infer<ReturnType<typeof createUpdateMongoSchema>>;

interface Props {
	mongoId: string;
}

export const UpdateMongo = ({ mongoId }: Props) => {
	const { t } = useTranslation("dashboard");
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isLoading } =
		api.mongo.update.useMutation();
	const { data } = api.mongo.one.useQuery(
		{
			mongoId,
		},
		{
			enabled: !!mongoId,
		},
	);
	const form = useForm<UpdateMongo>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(createUpdateMongoSchema(t)),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateMongo) => {
		await mutateAsync({
			name: formData.name,
			mongoId: mongoId,
			description: formData.description || "",
		})
			.then(() => {
				toast.success(t("dashboard.mongo.updatedSuccessfully"));
				utils.mongo.one.invalidate({
					mongoId: mongoId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(t("dashboard.mongo.errorUpdating"));
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
					<DialogTitle>{t("dashboard.mongo.modify")}</DialogTitle>
					<DialogDescription>
						{t("dashboard.mongo.updateDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-mongo"
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("dashboard.mongo.name")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("dashboard.mongo.namePlaceholder")}
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
											<FormLabel>{t("dashboard.mongo.description")}</FormLabel>
											<FormControl>
												<Textarea
													placeholder={t(
														"dashboard.mongo.descriptionPlaceholder",
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
										isLoading={isLoading}
										form="hook-form-update-mongo"
										type="submit"
									>
										{t("dashboard.mongo.update")}
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
