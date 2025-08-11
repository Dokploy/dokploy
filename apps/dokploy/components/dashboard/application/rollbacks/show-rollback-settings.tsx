import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const formSchema = z.object({
	rollbackActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
	applicationId: string;
	children?: React.ReactNode;
}

export const ShowRollbackSettings = ({ applicationId, children }: Props) => {
	const { t } = useTranslation("dashboard");
	const [isOpen, setIsOpen] = useState(false);
	const { data: application, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);

	const { mutateAsync: updateApplication, isLoading } =
		api.application.update.useMutation();

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			rollbackActive: application?.rollbackActive ?? false,
		},
	});

	const onSubmit = async (data: FormValues) => {
		await updateApplication({
			applicationId,
			rollbackActive: data.rollbackActive,
		})
			.then(() => {
				toast.success(t("dashboard.rollback.settingsUpdated"));
				setIsOpen(false);
				refetch();
			})
			.catch(() => {
				toast.error(t("dashboard.rollback.failedToUpdateSettings"));
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("dashboard.rollback.rollbackSettings")}</DialogTitle>
					<DialogDescription>
						{t("dashboard.rollback.configureRollbacksDescription")}
					</DialogDescription>
					<AlertBlock>{t("dashboard.rollback.rollbackWarning")}</AlertBlock>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						<FormField
							control={form.control}
							name="rollbackActive"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
									<div className="space-y-0.5">
										<FormLabel className="text-base">
											{t("dashboard.rollback.enableRollbacks")}
										</FormLabel>
										<FormDescription>
											{t("dashboard.rollback.allowRollingBackDescription")}
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

						<Button type="submit" className="w-full" isLoading={isLoading}>
							{t("dashboard.rollback.saveSettings")}
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
