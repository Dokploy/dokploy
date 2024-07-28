import dynamic from "next/dynamic";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { DropdownMenuItem } from "~/components/ui/dropdown-menu";

const Terminal = dynamic(
	() => import("./docker-terminal").then((e) => e.DockerTerminal),
	{
		ssr: false,
	},
);

interface Props {
	containerId: string;
	children?: React.ReactNode;
}

export const DockerTerminalModal = ({ children, containerId }: Props) => {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					{children}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-7xl">
				<DialogHeader>
					<DialogTitle>Docker Terminal</DialogTitle>
					<DialogDescription>
						Easy way to access to docker container
					</DialogDescription>
				</DialogHeader>

				<Terminal id="terminal" containerId={containerId} />
			</DialogContent>
		</Dialog>
	);
};
