export default function Home() {
	return (
		<div className="flex flex-col gap-4 w-full max-w-4xl mx-auto">
			<h1 className="text-3xl font-bold text-center mb-6">Privacy</h1>

			<section className="flex flex-col gap-2">
				<p>
					At Dokploy, we are committed to protecting your privacy. This Privacy
					Policy explains how we collect, use, and safeguard your personal
					information when you use our website and services.
				</p>
				<p>
					By using Dokploy, you agree to the collection and use of information
					in accordance with this Privacy Policy. If you do not agree with these
					practices, please do not use our services.
				</p>
				<h2 className="text-2xl font-semibold mb-4">
					1. Information We Collect
				</h2>
				<p className="">
					We only collect limited, non-personal data through Umami Analytics, a
					privacy-focused analytics tool. No personal identifying information
					(PII) is collected. The data we collect includes:
				</p>
				<ul className="list-disc list-inside mb-4">
					<li>Website usage statistics (e.g., page views, session duration)</li>
					<li>Anonymized IP addresses</li>
					<li>Referring websites</li>
					<li>Browser and device type</li>
				</ul>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">
					2. How We Use the Information
				</h2>
				<p className="mb-4">
					The information we collect is used solely for improving the
					functionality and user experience of our platform. Specifically, we
					use it to:
				</p>
				<ul className="list-disc list-inside mb-4">
					<li>Monitor traffic and website performance</li>
					<li>Optimize the user experience</li>
					<li>Understand how users interact with our platform</li>
				</ul>
				<p>
					Additionally, we use a single cookie to manage user sessions, which is
					necessary for the proper functioning of the platform.
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-2xl font-semibold mb-4">3. Data Security</h2>
				<p className="">
					We take reasonable precautions to protect your data. Since we do not
					collect personal information, the risk of data misuse is minimized.
					Umami Analytics is privacy-friendly and does not rely on cookies or
					store PII.
				</p>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">4. Third-Party Services</h2>

				<p>
					We do not share your data with any third-party services other than
					Umami Analytics. We do not sell, trade, or transfer your data to
					outside parties.
				</p>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">5. Cookies</h2>
				<p className="mb-4">
					Dokploy does not use cookies to track user activity. Umami Analytics
					is cookie-free and does not require any tracking cookies for its
					functionality.
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-2xl font-semibold mb-4">
					6. Changes to This Privacy Policy
				</h2>
				<p className="">
					We may update this Privacy Policy from time to time. Any changes will
					be posted on this page, and it is your responsibility to review this
					policy periodically.
				</p>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">12. Contact Information</h2>
				<p className="mb-4">
					If you have any questions or concerns regarding these Privacy Policy,
					please contact us at:
				</p>
				<p className="mb-4">
					Email:
					<a
						href="mailto:support@dokploy.com"
						className="text-blue-500 hover:underline"
					>
						support@dokploy.com
					</a>
				</p>
			</section>
		</div>
	);
}
