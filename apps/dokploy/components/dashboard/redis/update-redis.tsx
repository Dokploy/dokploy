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
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const createUpdateRedisSchema = (t: any) =>
	z.object({
		name: z.string().min(1, {
			message: t("dashboard.redis.nameRequired"),
		}),
		description: z.string().optional(),
	});

type UpdateRedis = z.infer<ReturnType<typeof createUpdateRedisSchema>>;

interface Props {
	redisId: string;
}

export const UpdateRedis = ({ redisId }: Props) => {
	const { t } = useTranslation("dashboard");
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isLoading } =
		api.redis.update.useMutation();
	const { data } = api.redis.one.useQuery(
		{
			redisId,
		},
		{
			enabled: !!redisId,
		},
	);
	const form = useForm<UpdateRedis>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
		},
		resolver: zodResolver(createUpdateRedisSchema(t)),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateRedis) => {
		await mutateAsync({
			name: formData.name,
			redisId: redisId,
			description: formData.description || "",
		})
			.then(() => {
				toast.success(t("dashboard.redis.updatedSuccessfully"));
				utils.redis.one.invalidate({
					redisId: redisId,
				});
			})
			.catch(() => {
				toast.error(t("dashboard.redis.errorUpdating"));
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
					<DialogTitle>{t("dashboard.redis.modify")}</DialogTitle>
					<DialogDescription>
						{t("dashboard.redis.updateDescription")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-redis"
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("dashboard.redis.name")}</FormLabel>
											<FormControl>
												<Input
													placeholder={t("dashboard.redis.namePlaceholder")}
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
											<FormLabel>{t("dashboard.redis.description")}</FormLabel>
											<FormControl>
												<Textarea
													placeholder={t(
														"dashboard.redis.descriptionPlaceholder",
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
										form="hook-form-update-redis"
										type="submit"
									>
										{t("dashboard.redis.update")}
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
