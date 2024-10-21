import { CallToAction } from "@/components/CallToAction";
import { Faqs } from "@/components/Faqs";
import { Hero } from "@/components/Hero";
import { PrimaryFeatures } from "@/components/PrimaryFeatures";
import { SecondaryFeatures } from "@/components/SecondaryFeatures";

export default function Home() {
	return (
		<div>
			<main>
				<Hero />
				<PrimaryFeatures />
				<SecondaryFeatures />
				<CallToAction />
				{/* <Testimonials /> */}
				<Faqs />
			</main>
		</div>
	);
}
