import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

interface Props {
	statusCode: number;
}

export default function Custom404({ statusCode }: Props) {
	return (
		<div className="h-screen">
			<section className="relative z-10 bg-background h-screen items-center justify-center">
				<div className="container mx-auto h-screen items-center justify-center flex">
					<div className="-mx-4 flex">
						<div className="w-full px-4">
							<div className="mx-auto max-w-[400px] text-center">
								<h2 className="mb-2 text-[50px] font-bold leading-none text-white sm:text-[80px] md:text-[100px]">
									{statusCode
										? `An error ${statusCode} occurred on server`
										: "An error occurred on client"}
								</h2>
								<h4 className="mb-3 text-[22px] font-semibold leading-tight text-white">
									Oops! That page can’t be found
								</h4>
								<p className="mb-8 text-lg text-white">
									The page you are looking was not found
								</p>
								<Link
									href="/"
									className={buttonVariants({
										size: "lg",
									})}
								>
									Go To Home
								</Link>
							</div>
						</div>
					</div>
				</div>

				<div className="absolute left-0 top-0 -z-10 flex h-full w-full items-center justify-between space-x-5 md:space-x-8 lg:space-x-14">
					<div className="h-full w-1/3 bg-gradient-to-t from-[#FFFFFF14] to-[#C4C4C400]" />
					<div className="flex h-full w-1/3">
						<div className="h-full w-1/2 bg-gradient-to-b from-[#FFFFFF14] to-[#C4C4C400]" />
						<div className="h-full w-1/2 bg-gradient-to-t from-[#FFFFFF14] to-[#C4C4C400]" />
					</div>
					<div className="h-full w-1/3 bg-gradient-to-b from-[#FFFFFF14] to-[#C4C4C400]" />
				</div>
			</section>
		</div>
	);
}

// @ts-ignore
Error.getInitialProps = ({ res, err }) => {
	const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
	return { statusCode };
};
