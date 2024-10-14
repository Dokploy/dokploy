export default function Home() {
	return (
		<div className="flex flex-col gap-4 w-full max-w-4xl mx-auto">
			<h1 className="text-3xl font-bold text-center mb-6">
				Terms and Conditions
			</h1>

			<section className="flex flex-col gap-2">
				<p>
					Welcome to Dokploy! These Terms and Conditions outline the rules and
					regulations for the use of Dokploy’s website and services.
				</p>
				<p>
					By accessing or using our services, you agree to be bound by the
					following terms. If you do not agree with these terms, please do not
					use our website or services.
				</p>
				<h2 className="text-2xl font-semibold mb-4">1. Definitions</h2>
				<p className="">
					Website: Refers to the website of Dokploy (
					<a
						href="https://dokploy.com"
						className="text-blue-500 hover:underline"
					>
						https://dokploy.com
					</a>
					) and its subdomains.
				</p>
				<p>
					Services: The platform and related services offered by Dokploy for
					deploying and managing applications using Docker and other related
					tools.
				</p>
				<p>User: Any individual or organization using Dokploy.</p>
				<p>
					Subscription: The paid plan for using additional features, resources,
					or server capacity.
				</p>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">2. Service Description</h2>
				<p className="mb-4">
					Dokploy is a platform that allows users to deploy and manage web
					applications on their own servers using custom builders and Docker
					technology. Dokploy offers both free and paid services, including
					subscriptions for adding additional servers, features, or increased
					capacity.
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-2xl font-semibold mb-4">
					3. User Responsibilities
				</h2>
				<p className="">
					Users are responsible for maintaining the security of their accounts,
					servers, and applications deployed through Dokploy.
				</p>
				<p className="">
					Users must not use the platform for illegal activities, including but
					not limited to distributing malware, violating intellectual property
					rights, or engaging in cyberattacks.
				</p>
				<p className="">
					Users must comply with all local, state, and international laws in
					connection with their use of Dokploy.
				</p>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">
					4. Subscription and Payment
				</h2>
				<ul className="list-disc list-inside mb-4">
					<li>
						By purchasing a subscription, users agree to the pricing and payment
						terms detailed on the website or via Paddle (our payment processor).
					</li>
					<li>
						Subscriptions renew automatically unless canceled by the user before
						the renewal date.
					</li>
				</ul>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">5. Refund Policy</h2>
				<p className="mb-4">
					Due to the nature of our digital services, Dokploy operates on a
					no-refund policy for any paid subscriptions, except where required by
					law. We offer a self-hosted version of Dokploy with the same core
					functionalities, which users can deploy and use without any cost. We
					recommend users try the self-hosted version to evaluate the platform
					before committing to a paid subscription.
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-2xl font-semibold mb-4">
					6. Limitations of Liability
				</h2>
				<p className="">
					Dokploy is provided "as is" without any warranties, express or
					implied, including but not limited to the availability, reliability,
					or accuracy of the service.
				</p>
				<p className="">
					Users are fully responsible for any modifications made to their remote
					servers or the environment where Dokploy is deployed. Any changes to
					the server configuration, system settings, security policies, or other
					environments that deviate from the recommended use of Dokploy may
					result in compatibility issues, performance degradation, or security
					vulnerabilities. Additionally, Dokploy may not function properly on
					unsupported operating systems or environments. We do not guarantee the
					platform will operate correctly or reliably under modified server
					conditions or on unsupported systems, and we will not be held liable
					for any disruptions, malfunctions, or damages resulting from such
					changes or unsupported configurations.
				</p>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">
					7. Service Modifications and Downtime
				</h2>
				<p className="mb-4">
					While we strive to provide uninterrupted service, there may be periods
					of downtime due to scheduled maintenance or upgrades to our
					infrastructure, such as server maintenance or system improvements. We
					will provide notice to users ahead of any planned maintenance.
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-2xl font-semibold mb-4">
					8. Intellectual Property
				</h2>
				<p className="">
					Dokploy retains all intellectual property rights to the platform,
					including code, design, and content.
				</p>
				<p className="">
					Users are granted a limited, non-exclusive, and non-transferable
					license to use Dokploy in accordance with these terms.
				</p>
				<p className="">
					Users may not modify, reverse-engineer, or distribute any part of the
					platform without express permission.
				</p>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">9. Termination</h2>
				<p className="mb-4">
					Dokploy reserves the right to suspend or terminate access to the
					platform for users who violate these terms or engage in harmful
					behavior.
				</p>
				<p className="mb-4">
					Users may terminate their account at any time by contacting support.
					Upon termination, access to the platform will be revoked, and any
					stored data may be permanently deleted.
				</p>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">10. Changes to Terms</h2>
				<p className="mb-4">
					Dokploy reserves the right to update these Terms & Conditions at any
					time. Changes will be effective immediately upon posting on the
					website. It is the user's responsibility to review these terms
					periodically.
				</p>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">11. Governing Law</h2>
				<p className="mb-4">
					These Terms & Conditions are governed by applicable laws based on the
					user's location. Any disputes arising under these terms will be
					resolved in accordance with the legal jurisdiction relevant to the
					user’s location, unless otherwise required by applicable law.
				</p>
			</section>

			<section className="">
				<h2 className="text-2xl font-semibold mb-4">12. Contact Information</h2>
				<p className="mb-4">
					If you have any questions or concerns regarding these Terms, you can
					reach us at:
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
