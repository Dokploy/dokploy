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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addToTeamSchema = z.object({
	teamId: z.string().min(1, "Team is required"),
	role: z.enum(["ADMIN", "MEMBER", "GUEST"]),
});

type AddToTeamData = z.infer<typeof addToTeamSchema>;

interface AddToTeamProps {
	userId: string;
}

export const AddToTeam = ({ userId }: AddToTeamProps) => {
	const utils = api.useContext();
	const { data: teams } = api.team.all.useQuery();
	const [open, setOpen] = useState(false);
	const { mutateAsync, isError, error, isLoading } =
		api.team.addUserToTeam.useMutation({
			onSuccess: (data) => {
				toast.success(data.message);
				if (!data.alreadyMember) {
					utils.team.all.invalidate();
					utils.team.byId.invalidate();
				}
				setOpen(false);
				form.reset();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		});

	const form = useForm<AddToTeamData>({
		resolver: zodResolver(addToTeamSchema),
		defaultValues: {
			teamId: "",
			role: "GUEST", // Default role
		},
	});

	useEffect(() => {
		form.reset();
	}, [form, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddToTeamData) => {
		console.log("Submitting with:", { userId, teamId: data.teamId }); // Debug log
		await mutateAsync({
			teamId: data.teamId,
			userId,
			role: data.role,
		});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					Add to Team
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add User to Team</DialogTitle>
					<DialogDescription>
						Select a team and role for the user.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="teamId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Team</FormLabel>
									<FormControl>
										<Select
											onValueChange={(value) => {
												field.onChange(value);
												form.clearErrors("teamId");
											}}
											value={field.value}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select a team" />
											</SelectTrigger>
											<SelectContent>
												{teams?.map((team) => (
													<SelectItem key={team.teamId} value={team.teamId}>
														{team.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="role"
							render={({ field }) => (
								<FormItem className="space-y-3">
									<FormLabel>Role</FormLabel>
									<FormControl>
										<RadioGroup
											onValueChange={field.onChange}
											defaultValue={field.value}
											className="flex space-x-4"
										>
											<FormItem className="flex items-center space-x-2">
												<FormControl>
													<RadioGroupItem value="ADMIN" />
												</FormControl>
												<FormLabel className="font-normal">Admin</FormLabel>
											</FormItem>
											<FormItem className="flex items-center space-x-2">
												<FormControl>
													<RadioGroupItem value="MEMBER" />
												</FormControl>
												<FormLabel className="font-normal">Member</FormLabel>
											</FormItem>
											<FormItem className="flex items-center space-x-2">
												<FormControl>
													<RadioGroupItem value="GUEST" />
												</FormControl>
												<FormLabel className="font-normal">Guest</FormLabel>
											</FormItem>
										</RadioGroup>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button type="submit" isLoading={isLoading}>
								Add to Team
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
