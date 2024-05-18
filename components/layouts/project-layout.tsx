import { Navbar } from "./navbar";

interface Props {
	children: React.ReactNode;
}

export const ProjectLayout = ({ children }: Props) => {
	return (
		<div>
			<div
				className="bg-radial relative flex flex-col bg-background"
				id="app-container"
			>
				<div className="flex items-center justify-center">
					<div className="w-full">
						<Navbar />
						<main className="mt-6 flex w-full flex-col items-center">
							<div className="w-full max-w-8xl px-4 lg:px-8">{children}</div>
						</main>
					</div>
				</div>
			</div>
		</div>
	);
};
