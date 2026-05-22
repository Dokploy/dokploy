import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";

interface Props {
	memberId: string;
	userEmail: string;
}

export const TransferOwnership = ({ memberId, userEmail }: Props) => {
	const utils = api.useUtils();
	const { mutateAsync, isPending } =
		api.organization.transferOwnership.useMutation();

	return (
		<DialogAction
			title="Transfer Ownership"
			description={
				<>
					Transfer organization ownership to <strong>{userEmail}</strong>? You
					will become an admin.
				</>
			}
			disabled={isPending}
			type="destructive"
			onClick={async () => {
				await mutateAsync({ memberId })
					.then(async () => {
						toast.success("Ownership transferred successfully");
						await utils.user.all.invalidate();
						await utils.organization.active.invalidate();
					})
					.catch((error) => {
						toast.error(error?.message || "Error transferring ownership");
					});
			}}
		>
			<DropdownMenuItem
				className="w-full cursor-pointer text-red-500 hover:!text-red-600"
				onSelect={(e) => e.preventDefault()}
			>
				Transfer Ownership
			</DropdownMenuItem>
		</DialogAction>
	);
};
