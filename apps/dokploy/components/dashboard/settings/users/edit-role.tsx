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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit3Icon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const editUserRole = z.object({
	role: z.enum(["member", "admin"]),
});

type EditUserRole = z.infer<typeof editUserRole>;

interface EditUserRoleProps {
	userId: string;
	currentRole: string;
	userEmail: string;
}

export const EditUserRole = ({ userId, currentRole, userEmail }: EditUserRoleProps) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const { mutateAsync: updateRoleMember, isLoading } = api.user.updateRoleMember.useMutation();

	const form = useForm<EditUserRole>({
		defaultValues: {
			role: currentRole,
		} as EditUserRole,
		resolver: zodResolver(editUserRole),
	});

	const onSubmit = async (data: EditUserRole) => {
		if (data.role === currentRole) {
			toast.info("No changes made");
			setOpen(false);
			return;
		}

		try {
			await updateRoleMember({
				userId: userId,
				role: data.role,
			});

			toast.success(`User role updated to ${data.role}`);
			setOpen(false);
			
			utils.user.all.invalidate();
		} catch (error: any) {
			toast.error(error?.message || "Error updating user role");
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					<Edit3Icon className="h-4 w-4 mr-2" />
					Edit Role
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit User Role</DialogTitle>
					<DialogDescription>
						Change the role for {userEmail}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						id="edit-user-role-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-4"
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
											<SelectItem value="member">Member</SelectItem>
											<SelectItem value="admin">Admin</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>
				</Form>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isLoading}
					>
						Cancel
					</Button>
					<Button
						form="edit-user-role-form"
						type="submit"
						isLoading={isLoading}
					>
						Update Role
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};