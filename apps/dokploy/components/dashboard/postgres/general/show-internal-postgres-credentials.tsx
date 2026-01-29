import { Loader2, Pen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ToggleVisibilityInput } from "@/components/shared/toggle-visibility-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

interface Props {
	postgresId: string;
}
export const ShowInternalPostgresCredentials = ({ postgresId }: Props) => {
	const { data } = api.postgres.one.useQuery({ postgresId });
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">Internal Credentials</CardTitle>
					</CardHeader>
					<CardContent className="flex w-full flex-row gap-4">
						<div className="grid w-full md:grid-cols-2 gap-4 md:gap-8">
							<div className="flex flex-col gap-2">
								<Label>User</Label>
								<Input disabled value={data?.databaseUser} />
							</div>
							<div className="flex flex-col gap-2">
								<Label>Database Name</Label>
								<Input disabled value={data?.databaseName} />
							</div>
							<div className="flex flex-col gap-2">
								<Label>Password</Label>
								<div className="flex flex-row gap-4 items-center">
									<ToggleVisibilityInput
										value={data?.databasePassword}
										disabled
									/>
									<UpdatePassword postgresId={postgresId} />
								</div>
							</div>
							<div className="flex flex-col gap-2">
								<Label>Internal Port (Container)</Label>
								<Input disabled value="5432" />
							</div>

							<div className="flex flex-col gap-2">
								<Label>Internal Host</Label>
								<Input disabled value={data?.appName} />
							</div>

							<div className="flex flex-col gap-2">
								<Label>Internal Connection URL </Label>
								<ToggleVisibilityInput
									disabled
									value={`postgresql://${data?.databaseUser}:${data?.databasePassword}@${data?.appName}:5432/${data?.databaseName}`}
								/>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
};

const UpdatePassword = ({ postgresId }: { postgresId: string }) => {
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState("");
	const utils = api.useUtils();

	const { mutateAsync, isLoading } = api.postgres.changePassword.useMutation();

	const onSave = async () => {
		if (!password) {
			toast.error("Password is required");
			return;
		}
		try {
			await mutateAsync({
				postgresId,
				databasePassword: password,
			});
			await utils.postgres.one.invalidate({ postgresId });
			toast.success("Password updated successfully");
			setOpen(false);
			setPassword("");
		} catch (error) {
			toast.error("Error updating password");
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="icon">
					<Pen className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Update Password</DialogTitle>
					<DialogDescription>
						This will update the password in the database and in the dependent
						applications.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label>New Password</Label>
						<Input
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Enter new password"
							type="password"
						/>
					</div>
				</div>

				<DialogFooter>
					<Button onClick={onSave} disabled={isLoading}>
						{isLoading && <Loader2 className="animate-spin size-4 mr-2" />}
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
