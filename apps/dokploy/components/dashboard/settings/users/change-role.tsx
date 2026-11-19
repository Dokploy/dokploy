import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect, useState } from "react";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

const changeRoleSchema = z.object({
	role: z.string().min(1),
});

type ChangeRoleSchema = z.infer<typeof changeRoleSchema>;

interface Props {
	memberId: string;
	currentRole: string;
	userEmail: string;
}

export const ChangeRole = ({ memberId, currentRole, userEmail }: Props) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const { data: customRoles } = api.customRole.all.useQuery(undefined, {
		enabled: isOpen,
	});

	const { mutateAsync, isError, error, isPending } =
		api.organization.updateMemberRole.useMutation();

	const form = useForm<ChangeRoleSchema>({
		defaultValues: {
			role: currentRole,
		},
		resolver: zodResolver(changeRoleSchema),
	});

	useEffect(() => {
		if (isOpen) {
			form.reset({
				role: currentRole,
			});
		}
	}, [form, currentRole, isOpen]);

	const onSubmit = async (data: ChangeRoleSchema) => {
		await mutateAsync({
			memberId,
			role: data.role,
		})
			.then(async () => {
				toast.success(t("settings.users.roleUpdated"));
				await utils.user.all.invalidate();
				setIsOpen(false);
			})
			.catch((error) => {
				toast.error(error?.message || t("settings.users.roleUpdateError"));
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					{t("settings.users.changeRole")}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh] sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("settings.users.changeRoleTitle")}</DialogTitle>
					<DialogDescription>
						{t("settings.users.changeRolePrefix")} <strong>{userEmail}</strong>
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-change-role"
						onSubmit={form.handleSubmit(onSubmit)}
						className="w-full space-y-4"
					>
						<FormField
							control={form.control}
							name="role"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("settings.users.role")}</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t("settings.users.rolePlaceholder")}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="admin">
												{t("settings.users.admin")}
											</SelectItem>
											<SelectItem value="member">
												{t("settings.users.member")}
											</SelectItem>
											{customRoles?.map((customRole) => (
												<SelectItem
													key={customRole.role}
													value={customRole.role}
												>
													{customRole.role}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormDescription>
										<strong>{t("settings.users.admin")}:</strong>{" "}
										{t("settings.users.adminDescription")}
										<br />
										<strong>{t("settings.users.member")}:</strong>{" "}
										{t("settings.users.memberDescription")}
										{customRoles && customRoles.length > 0 && (
											<>
												<br />
												<strong>{t("settings.users.customRoles")}:</strong>{" "}
												{t("settings.users.customRolesDescription")}
											</>
										)}
										<br />
										<em className="text-muted-foreground text-xs">
											{t("settings.users.ownerNontransferable")}
										</em>
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>
				</Form>

				<DialogFooter>
					<Button
						isLoading={isPending}
						form="hook-form-change-role"
						type="submit"
					>
						{t("settings.users.updateRole")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
