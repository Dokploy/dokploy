import merge from "lodash/merge";
import {
	enAcceptInvitationPageMessages,
	enBillingPageMessages,
	enCommonMessages,
	enDashboardLayoutMessages,
	enDashboardProjectsPageMessages,
	enDatabasePageMessages,
	enDeploymentsPageMessages,
	enErrorPageMessages,
	enInvitationPageMessages,
	enLoginPageMessages,
	enMonitoringPageMessages,
	enOnboardingPageMessages,
	enProjectEnvironmentPageMessages,
	enProjectPageMessages,
	enRegisterPageMessages,
	enResetPasswordPageMessages,
	enSendResetPasswordPageMessages,
	enServiceDetailsPageMessages,
	enServerPageMessages,
} from "@/messages/en";
import {
	ruAcceptInvitationPageMessages,
	ruBillingPageMessages,
	ruCommonMessages,
	ruDashboardLayoutMessages,
	ruDashboardProjectsPageMessages,
	ruDatabasePageMessages,
	ruDeploymentsPageMessages,
	ruErrorPageMessages,
	ruInvitationPageMessages,
	ruLoginPageMessages,
	ruMonitoringPageMessages,
	ruOnboardingPageMessages,
	ruProjectEnvironmentPageMessages,
	ruProjectPageMessages,
	ruRegisterPageMessages,
	ruResetPasswordPageMessages,
	ruSendResetPasswordPageMessages,
	ruServiceDetailsPageMessages,
	ruServerPageMessages,
} from "@/messages/ru";

import type { Locale } from "./locale";

interface Messages {
	[key: string]: unknown;
}

const buildMessages = (...parts: Messages[]): Messages => merge({}, ...parts);

const EN_MESSAGE_PARTS: Messages[] = [
	enCommonMessages,
	enLoginPageMessages,
	enDashboardLayoutMessages,
	enDashboardProjectsPageMessages,
	enProjectPageMessages,
	enProjectEnvironmentPageMessages,
	enServerPageMessages,
	enSendResetPasswordPageMessages,
	enServiceDetailsPageMessages,
	enDeploymentsPageMessages,
	enMonitoringPageMessages,
	enDatabasePageMessages,
	enBillingPageMessages,
	enOnboardingPageMessages,
	enRegisterPageMessages,
	enInvitationPageMessages,
	enAcceptInvitationPageMessages,
	enResetPasswordPageMessages,
	enErrorPageMessages,
];

const RU_MESSAGE_PARTS: Messages[] = [
	ruCommonMessages,
	ruLoginPageMessages,
	ruDashboardLayoutMessages,
	ruDashboardProjectsPageMessages,
	ruProjectPageMessages,
	ruProjectEnvironmentPageMessages,
	ruServerPageMessages,
	ruSendResetPasswordPageMessages,
	ruServiceDetailsPageMessages,
	ruDeploymentsPageMessages,
	ruMonitoringPageMessages,
	ruDatabasePageMessages,
	ruBillingPageMessages,
	ruOnboardingPageMessages,
	ruRegisterPageMessages,
	ruInvitationPageMessages,
	ruAcceptInvitationPageMessages,
	ruResetPasswordPageMessages,
	ruErrorPageMessages,
];

const enMessages = buildMessages(...EN_MESSAGE_PARTS);
const ruMessages = buildMessages(...RU_MESSAGE_PARTS);
const messagesRuWithFallback = buildMessages(enMessages, ruMessages);

const messages: Record<Locale, Messages> = {
	ru: messagesRuWithFallback,
	en: enMessages,
};

export const getMessages = (locale: Locale): Messages => messages[locale];
