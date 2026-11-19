import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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

const updateLibsqlSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
});

type UpdateLibsql = z.infer<typeof updateLibsqlSchema>;

interface Props {
	libsqlId: string;
}

export const UpdateLibsql = ({ libsqlId }: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isPending } =
		api.libsql.update.useMutation();
	const { data } = api.libsql.one.useQuery(
		{
			libsqlId,
		},
		{
			enabled: !!libsqlId,
		},
	);
	const form = useForm<UpdateLibsql>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(updateLibsqlSchema),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateLibsql) => {
		await mutateAsync({
			name: formData.name,
			libsqlId: libsqlId,
			description: formData.description || "",
		})
			.then(() => {
				toast.success(t("database.updateSuccess", { engine: "Libsql" }));
				utils.libsql.one.invalidate({
					libsqlId: libsqlId,
				});
			})
			.catch(() => {
				toast.error(t("database.updateError", { engine: "Libsql" }));
			})
			.finally(() => {});
	};

	return (
		<Dialog>
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
					<DialogTitle>
						{t("database.modifyTitle", { engine: "Libsql" })}
					</DialogTitle>
					<DialogDescription>
						{t("database.modifyDescription", { engine: "Libsql" })}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-libsql"
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("database.labelName")}</FormLabel>
											<FormControl>
												<Input placeholder="Vandelay Industries" {...field} />
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
											<FormLabel>{t("database.labelDescription")}</FormLabel>
											<FormControl>
												<Textarea
													placeholder={t("database.descriptionPlaceholder")}
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
										form="hook-form-update-libsql"
										type="submit"
									>
										Update
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
