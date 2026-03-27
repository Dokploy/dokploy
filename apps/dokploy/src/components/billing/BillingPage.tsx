import { format } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import { ru as ruDateLocale } from 'date-fns/locale/ru'
import { useRouter } from 'next/router'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { BillingSubscriptionCard } from '@/components/billing/BillingSubscriptionCard'
import { paymentStatusBadgeVariant } from '@/components/billing/billing-display'
import { PricingPlans } from '@/components/billing/PricingPlans'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { api } from '@/utils/api'

const formatAmountRub = (amountKopek: number): string => {
	return `${Math.round(amountKopek / 100)}₽`
}

export const BillingPage = () => {
	const router = useRouter()
	const locale = useLocale()
	const t = useTranslations('billing')
	const utils = api.useUtils()
	const paymentReturnToastShown = useRef(false)
	const dateLocale = locale === 'ru' ? ruDateLocale : enUS

	const {data: subscription} = api.billing.getSubscription.useQuery()
	const {data: payments, isPending: isPaymentsLoading} =
		api.billing.getPayments.useQuery()
	const {mutateAsync: cancelSubscription, isPending: isCancelLoading} =
		api.billing.cancelSubscription.useMutation()
	const {mutateAsync: syncCheckoutStatus} =
		api.billing.syncCheckoutStatus.useMutation()

	useEffect(() => {
		if (!router.isReady) return
		const status = router.query.status
		if (status !== 'success' && status !== 'fail') return

		const syncAndRefresh = async () => {
			if (status === 'success') {
				try {
					await syncCheckoutStatus()
				} catch {
					// keep UX resilient: we'll still refresh and show a generic success/fail toast
				}
			}

			await Promise.all([
				utils.billing.getSubscription.invalidate(),
				utils.billing.getPayments.invalidate(),
			])
		}

		void syncAndRefresh()

		if (paymentReturnToastShown.current) return
		paymentReturnToastShown.current = true

		if (status === 'success') {
			toast.success(t('paymentReturn.success'))
		} else {
			toast.error(t('paymentReturn.fail'))
		}

		const {status: _status, ...restQuery} = router.query
		void router.replace(
			{
				pathname: router.pathname,
				query: restQuery,
			},
			undefined,
			{shallow: true},
		)
	}, [router.isReady, router.query.status, syncCheckoutStatus, t, utils])

	const handleCancel = async () => {
		await cancelSubscription()
	}

	const paymentStatusLabel = (raw: string): string => {
		switch (raw) {
			case 'pending':
				return t('paymentStatus.pending')
			case 'succeeded':
				return t('paymentStatus.succeeded')
			case 'failed':
				return t('paymentStatus.failed')
			case 'canceled':
				return t('paymentStatus.canceled')
			default:
				return raw
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<BillingSubscriptionCard
				subscription={subscription ?? null}
				isCancelLoading={isCancelLoading}
				onCancel={handleCancel}
			/>

			<Card className="bg-background">
				<CardHeader>
					<CardTitle>{t('plansTitle')}</CardTitle>
				</CardHeader>
				<CardContent>
					<PricingPlans/>
				</CardContent>
			</Card>

			<Card className="bg-background">
				<CardHeader>
					<CardTitle>{t('historyTitle')}</CardTitle>
				</CardHeader>
				<CardContent>
					{isPaymentsLoading ? (
						<div className="text-sm text-muted-foreground">
							{t('loadingPayments')}
						</div>
					) : payments && payments.length > 0 ? (
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t('tableDate')}</TableHead>
										<TableHead>{t('tableAmount')}</TableHead>
										<TableHead>{t('tableStatus')}</TableHead>
										<TableHead>{t('tableOrderId')}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{payments.map((p) => (
										<TableRow key={p.id}>
											<TableCell>
												{format(new Date(p.createdAt), 'PP', {
													locale: dateLocale,
												})}
											</TableCell>
											<TableCell>{formatAmountRub(p.amount)}</TableCell>
											<TableCell>
												<Badge variant={paymentStatusBadgeVariant(p.status)}>
													{paymentStatusLabel(p.status)}
												</Badge>
											</TableCell>
											<TableCell className="font-mono text-xs">
												{p.orderId}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<div className="text-sm text-muted-foreground">{t('noPayments')}</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
