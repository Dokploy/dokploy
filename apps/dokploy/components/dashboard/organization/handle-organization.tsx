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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { PenBoxIcon, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
	organizationId?: string;
	children?: React.ReactNode;
}
export function AddOrganization({ organizationId }: Props) {
	const utils = api.useUtils();
	const { data: organization } = api.organization.one.useQuery(
		{
			organizationId: organizationId ?? "",
		},
		{
			enabled: !!organizationId,
		},
	);
	const { mutateAsync, isLoading } = organizationId
		? api.organization.update.useMutation()
		: api.organization.create.useMutation();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");

	useEffect(() => {
		if (organization) {
			setName(organization.name);
		}
	}, [organization]);
	const handleSubmit = async () => {
		await mutateAsync({ name, organizationId: organizationId ?? "" })
			.then(() => {
				setOpen(false);
				toast.success(
					`Organization ${organizationId ? "updated" : "created"} successfully`,
				);
				utils.organization.all.invalidate();
			})
			.catch((error) => {
				console.error(error);
				toast.error(
					`Failed to ${organizationId ? "update" : "create"} organization`,
				);
			});
	};
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{organizationId ? (
					<DropdownMenuItem
						className="group cursor-pointer hover:bg-blue-500/10"
						onSelect={(e) => e.preventDefault()}
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem
						className="gap-2 p-2"
						onClick={() => {
							setOpen(true);
						}}
						onSelect={(e) => e.preventDefault()}
					>
						<div className="flex size-6 items-center justify-center rounded-md border bg-background">
							<Plus className="size-4" />
						</div>
						<div className="font-medium text-muted-foreground">
							Add organization
						</div>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>
						{organizationId ? "Update organization" : "Add organization"}
					</DialogTitle>
					<DialogDescription>
						{organizationId
							? "Update the organization name"
							: "Create a new organization to manage your projects."}
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid grid-cols-4 items-center gap-4">
						<Label htmlFor="name" className="text-right">
							Name
						</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="col-span-3"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button type="submit" onClick={handleSubmit} isLoading={isLoading}>
						{organizationId ? "Update organization" : "Create organization"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
