import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
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
	role: z.enum(["admin", "member"]),
});

type ChangeRoleSchema = z.infer<typeof changeRoleSchema>;

interface Props {
	memberId: string;
	currentRole: "admin" | "member";
	userEmail: string;
}

export const ChangeRole = ({ memberId, currentRole, userEmail }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

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
				toast.success("Role updated successfully");
				await utils.user.all.invalidate();
				setIsOpen(false);
			})
			.catch((error) => {
				toast.error(error?.message || "Error updating role");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					Change Role
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh] sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Change User Role</DialogTitle>
					<DialogDescription>
						Change the role for <strong>{userEmail}</strong>
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
									<FormLabel>Role</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a role" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="admin">Admin</SelectItem>
											<SelectItem value="member">Member</SelectItem>
										</SelectContent>
									</Select>
									<FormDescription>
										<strong>Admin:</strong> Can manage users and settings.
										<br />
										<strong>Member:</strong> Limited permissions, can be
										customized.
										<br />
										<em className="text-muted-foreground text-xs">
											Note: Owner role is intransferible.
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
						Update Role
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
