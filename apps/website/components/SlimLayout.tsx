import Link from "next/link";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function SlimLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<div>
				<Header />
			</div>
			<main className="text-center flex-auto items-center flex justify-center">
				<div>
					<h1 className="mb-4 text-6xl font-semibold text-primary">404</h1>
					<p className="mb-4 text-lg text-muted-foreground">
						Oops! Looks like you're lost.
					</p>
					<p className="mt-4 text-muted-foreground">
						Let's get you back{" "}
						<Link href="/" className="text-primary">
							home
						</Link>
						.
					</p>
				</div>
			</main>
			<div>
				<Footer />
			</div>
		</>
	);
}
