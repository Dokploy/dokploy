type BackendLocale = "en" | "zh-Hans";

const getBackendLocale = (): BackendLocale => {
	const envLocale = process.env.DOKPLOY_LOCALE as BackendLocale | undefined;
	return envLocale ?? "zh-Hans";
};

export type EmailLocale = BackendLocale;

export type InvitationEmailContent = {
	subject: string;
	html: string;
	previewText: string;
	heading: {
		beforeOrganizationName: string;
		afterOrganizationName: string;
	};
	greeting: string;
	mainText: {
		beforeOrganizationName: string;
		afterOrganizationName: string;
	};
	buttonLabel: string;
	orCopyUrlText: string;
	footer: {
		beforeEmail: string;
		afterEmail: string;
	};
};

export const getInvitationEmailContent = (params: {
	organizationName: string;
	inviteLink: string;
	toEmail?: string;
	locale?: EmailLocale;
}): InvitationEmailContent => {
	const locale = params.locale ?? getBackendLocale();

	if (locale === "zh-Hans") {
		const contentBase: Omit<InvitationEmailContent, "html"> = {
			subject: "加入组织的邀请",
			previewText: `你被邀请加入 ${params.organizationName}（Dokploy）`,
			heading: {
				beforeOrganizationName: "加入 ",
				afterOrganizationName: "（Dokploy）",
			},
			greeting: "你好，",
			mainText: {
				beforeOrganizationName: "你被邀请加入 ",
				afterOrganizationName: "（Dokploy），这是一个用于部署应用的平台。",
			},
			buttonLabel: "接受邀请",
			orCopyUrlText: "或者将以下链接复制到浏览器中打开：",
			footer: {
				beforeEmail: "此邀请邮件发送给 ",
				afterEmail:
					"。如果你并未预期收到此邮件，可以忽略它。如果你担心账号安全，请回复此邮件与我们联系。",
			},
		};

		const htmlParts: string[] = [
			`<p>${contentBase.greeting}</p>`,
			`<p>${contentBase.mainText.beforeOrganizationName}${params.organizationName}${contentBase.mainText.afterOrganizationName}</p>`,
			`<p><a href="${params.inviteLink}">${contentBase.buttonLabel}</a></p>`,
			`<p>${contentBase.orCopyUrlText}<a href="${params.inviteLink}">${params.inviteLink}</a></p>`,
		];

		if (params.toEmail) {
			htmlParts.push(
				`<p>${contentBase.footer.beforeEmail}${params.toEmail}${contentBase.footer.afterEmail}</p>`,
			);
		}

		return {
			...contentBase,
			html: htmlParts.join(""),
		};
	}

	const contentBase: Omit<InvitationEmailContent, "html"> = {
		subject: "Invitation to join organization",
		previewText: `You are invited to join ${params.organizationName} on Dokploy`,
		heading: {
			beforeOrganizationName: "Join ",
			afterOrganizationName: " on Dokploy",
		},
		greeting: "Hello,",
		mainText: {
			beforeOrganizationName: "You have been invited to join ",
			afterOrganizationName:
				" on Dokploy, a platform that helps you deploy your apps to the cloud.",
		},
		buttonLabel: "Accept invitation",
		orCopyUrlText: "or copy and paste this URL into your browser:",
		footer: {
			beforeEmail: "This invitation was intended for ",
			afterEmail:
				". This invite was sent from dokploy.com. If you were not expecting this invitation, you can ignore this email. If you are concerned about your account's safety, please reply to this email to get in touch with us.",
		},
	};

	const htmlParts: string[] = [
		`<p>${contentBase.greeting}</p>`,
		`<p>${contentBase.mainText.beforeOrganizationName}${params.organizationName}${contentBase.mainText.afterOrganizationName}</p>`,
		`<p><a href="${params.inviteLink}">${contentBase.buttonLabel}</a></p>`,
		`<p>${contentBase.orCopyUrlText} <a href="${params.inviteLink}">${params.inviteLink}</a></p>`,
	];

	if (params.toEmail) {
		htmlParts.push(
			`<p>${contentBase.footer.beforeEmail}${params.toEmail}${contentBase.footer.afterEmail}</p>`,
		);
	}

	return {
		...contentBase,
		html: htmlParts.join(""),
	};
};

export const getVerifyEmailContent = (params: {
	url: string;
	locale?: EmailLocale;
}) => {
	const locale = params.locale ?? getBackendLocale();

	if (locale === "zh-Hans") {
		return {
			subject: "验证你的邮箱",
			html: `<p>点击下面的链接验证你的邮箱：<a href="${params.url}">验证邮箱</a></p>`,
		};
	}

	return {
		subject: "Verify your email",
		html: `<p>Click the link to verify your email: <a href="${params.url}">Verify Email</a></p>`,
	};
};

export const getResetPasswordEmailContent = (params: {
	url: string;
	locale?: EmailLocale;
}) => {
	const locale = params.locale ?? getBackendLocale();

	if (locale === "zh-Hans") {
		return {
			subject: "重置你的密码",
			html: `<p>点击下面的链接重置你的密码：<a href="${params.url}">重置密码</a></p>`,
		};
	}

	return {
		subject: "Reset your password",
		html: `<p>Click the link to reset your password: <a href="${params.url}">Reset Password</a></p>`,
	};
};

export type TestNotificationContent = {
	testMessage: string;
	emailSubject: string;
	emailHtml: string;
	discordTitle: string;
	notificationTitle: string;
	larkText: string;
	ntfyActions: string;
};

export const getTestNotificationContent = (): TestNotificationContent => {
	const locale = getBackendLocale();

	if (locale === "zh-Hans") {
		return {
			testMessage: "你好，来自 Dokploy 👋",
			emailSubject: "测试邮件",
			emailHtml: "<p>你好，来自 Dokploy 👋</p>",
			discordTitle: "`🤚` - 测试通知",
			notificationTitle: "测试通知",
			larkText: "你好，来自 Dokploy 👋",
			ntfyActions:
				"view, 访问 Dokploy 在 Github, https://github.com/dokploy/dokploy, clear=true;",
		};
	}

	return {
		testMessage: "Hi, From Dokploy 👋",
		emailSubject: "Test Email",
		emailHtml: "<p>Hi, From Dokploy 👋</p>",
		discordTitle: "`🤚` - Test Notification",
		notificationTitle: "Test Notification",
		larkText: "Hi, From Dokploy 👋",
		ntfyActions:
			"view, visit Dokploy on Github, https://github.com/dokploy/dokploy, clear=true;",
	};
};
 
export type BuildSuccessEmailContent = {
	subject: string;
	previewText: string;
	heading: {
		beforeApplicationName: string;
		afterApplicationName: string;
	};
	greeting: string;
	mainText: {
		beforeApplicationName: string;
		afterApplicationName: string;
	};
	detailsLabel: string;
	projectNameLabel: string;
	applicationNameLabel: string;
	environmentLabel: string;
	applicationTypeLabel: string;
	dateLabel: string;
	viewBuildButtonLabel: string;
	orCopyUrlText: string;
};

export const getBuildSuccessEmailContent = (params: {
	projectName: string;
	applicationName: string;
	applicationType: string;
	environmentName: string;
	buildLink: string;
	date: string;
	locale?: EmailLocale;
}): BuildSuccessEmailContent => {
	const locale = params.locale ?? getBackendLocale();

	if (locale === "zh-Hans") {
		return {
			subject: "Dokploy 构建成功",
			previewText: `应用 ${params.applicationName} 构建成功`,
			heading: {
				beforeApplicationName: "应用 ",
				afterApplicationName: " 构建成功",
			},
			greeting: "你好，",
			mainText: {
				beforeApplicationName: "你在 Dokploy 上的应用 ",
				afterApplicationName: " 构建已经成功完成。",
			},
			detailsLabel: "详情：",
			projectNameLabel: "项目名称：",
			applicationNameLabel: "应用名称：",
			environmentLabel: "环境：",
			applicationTypeLabel: "应用类型：",
			dateLabel: "时间：",
			viewBuildButtonLabel: "查看构建",
			orCopyUrlText: "或者将以下链接复制到浏览器中打开：",
		};
	}

	return {
		subject: "Build success for dokploy",
		previewText: `Build success for ${params.applicationName}`,
		heading: {
			beforeApplicationName: "Build success for ",
			afterApplicationName: "",
		},
		greeting: "Hello,",
		mainText: {
			beforeApplicationName: "Your build for ",
			afterApplicationName: " was successful",
		},
		detailsLabel: "Details:",
		projectNameLabel: "Project Name:",
		applicationNameLabel: "Application Name:",
		environmentLabel: "Environment:",
		applicationTypeLabel: "Application Type:",
		dateLabel: "Date:",
		viewBuildButtonLabel: "View build",
		orCopyUrlText: "or copy and paste this URL into your browser:",
	};
};

export type BuildFailedEmailContent = {
	subject: string;
	previewText: string;
	heading: {
		beforeApplicationName: string;
		afterApplicationName: string;
	};
	greeting: string;
	mainText: {
		beforeApplicationName: string;
		afterApplicationName: string;
	};
	detailsLabel: string;
	projectNameLabel: string;
	applicationNameLabel: string;
	applicationTypeLabel: string;
	dateLabel: string;
	reasonLabel: string;
	viewBuildButtonLabel: string;
	orCopyUrlText: string;
};

export const getBuildFailedEmailContent = (params: {
	projectName: string;
	applicationName: string;
	applicationType: string;
	buildLink: string;
	date: string;
	locale?: EmailLocale;
}): BuildFailedEmailContent => {
	const locale = params.locale ?? getBackendLocale();

	if (locale === "zh-Hans") {
		return {
			subject: "Dokploy 构建失败",
			previewText: `应用 ${params.applicationName} 构建失败`,
			heading: {
				beforeApplicationName: "应用 ",
				afterApplicationName: " 构建失败",
			},
			greeting: "你好，",
			mainText: {
				beforeApplicationName: "你在 Dokploy 上的应用 ",
				afterApplicationName: " 构建失败，请查看下面的错误信息。",
			},
			detailsLabel: "详情：",
			projectNameLabel: "项目名称：",
			applicationNameLabel: "应用名称：",
			applicationTypeLabel: "应用类型：",
			dateLabel: "时间：",
			reasonLabel: "原因：",
			viewBuildButtonLabel: "查看构建",
			orCopyUrlText: "或者将以下链接复制到浏览器中打开：",
		};
	}

	return {
		subject: "Build failed for dokploy",
		previewText: `Build failed for ${params.applicationName}`,
		heading: {
			beforeApplicationName: "Build failed for ",
			afterApplicationName: "",
		},
		greeting: "Hello,",
		mainText: {
			beforeApplicationName: "Your build for ",
			afterApplicationName: " failed. Please check the error message below.",
		},
		detailsLabel: "Details:",
		projectNameLabel: "Project Name:",
		applicationNameLabel: "Application Name:",
		applicationTypeLabel: "Application Type:",
		dateLabel: "Date:",
		reasonLabel: "Reason:",
		viewBuildButtonLabel: "View build",
		orCopyUrlText: "or copy and paste this URL into your browser:",
	};
};

export type DatabaseBackupEmailContent = {
	subject: string;
	previewText: string;
	greeting: string;
	heading: {
		beforeApplicationName: string;
		afterApplicationNameSuccess: string;
		afterApplicationNameError: string;
	};
	mainText: {
		beforeApplicationName: string;
		afterApplicationNameSuccess: string;
		afterApplicationNameError: string;
	};
	detailsLabel: string;
	projectNameLabel: string;
	applicationNameLabel: string;
	databaseTypeLabel: string;
	dateLabel: string;
	reasonLabel: string;
	errorMessageFallback: string;
};

export const getDatabaseBackupEmailContent = (params: {
	projectName: string;
	applicationName: string;
	databaseType: "postgres" | "mysql" | "mongodb" | "mariadb";
	type: "error" | "success";
	errorMessage?: string;
	date: string;
	locale?: EmailLocale;
}): DatabaseBackupEmailContent => {
	const locale = params.locale ?? getBackendLocale();
	const isSuccess = params.type === "success";

	if (locale === "zh-Hans") {
		return {
			subject: "Dokploy 数据库备份通知",
			previewText: isSuccess
				? `应用 ${params.applicationName} 的数据库备份成功 ✅`
				: `应用 ${params.applicationName} 的数据库备份失败 ❌`,
			greeting: "你好，",
			heading: {
				beforeApplicationName: "应用 ",
				afterApplicationNameSuccess: " 的数据库备份成功",
				afterApplicationNameError: " 的数据库备份失败，请查看下面的错误信息。",
			},
			mainText: {
				beforeApplicationName: "你在 Dokploy 上的应用 ",
				afterApplicationNameSuccess: " 的数据库备份已经成功完成。",
				afterApplicationNameError: " 的数据库备份失败，请查看下面的错误信息。",
			},
			detailsLabel: "详情：",
			projectNameLabel: "项目名称：",
			applicationNameLabel: "应用名称：",
			databaseTypeLabel: "数据库类型：",
			dateLabel: "时间：",
			reasonLabel: "原因：",
			errorMessageFallback: "未提供错误信息",
		};
	}

	return {
		subject: "Database backup for dokploy",
		previewText: isSuccess
			? `Database backup for ${params.applicationName} was successful ✅`
			: `Database backup for ${params.applicationName} failed ❌`,
		greeting: "Hello,",
		heading: {
			beforeApplicationName: "Database backup for ",
			afterApplicationNameSuccess: " was successful",
			afterApplicationNameError: " failed",
		},
		mainText: {
			beforeApplicationName: "Your database backup for ",
			afterApplicationNameSuccess: " was successful ✅",
			afterApplicationNameError:
				" failed. Please check the error message below. ❌",
		},
		detailsLabel: "Details:",
		projectNameLabel: "Project Name:",
		applicationNameLabel: "Application Name:",
		databaseTypeLabel: "Database Type:",
		dateLabel: "Date:",
		reasonLabel: "Reason:",
		errorMessageFallback: "Error message not provided",
	};
};

export type DockerCleanupEmailContent = {
	subject: string;
	previewText: string;
	headingText: string;
	greeting: string;
	bodyText: string;
	detailsLabel: string;
	messageLabel: string;
	dateLabel: string;
};

export const getDockerCleanupEmailContent = (params: {
	message: string;
	date: string;
	locale?: EmailLocale;
}): DockerCleanupEmailContent => {
	const locale = params.locale ?? getBackendLocale();

	if (locale === "zh-Hans") {
		return {
			subject: "Dokploy Docker 清理完成",
			previewText: "Dokploy Docker 清理完成",
			headingText: "Dokploy Docker 清理",
			greeting: "你好，",
			bodyText: "Dokploy 的 Docker 清理任务已经成功完成 ✅",
			detailsLabel: "详情：",
			messageLabel: "消息：",
			dateLabel: "时间：",
		};
	}

	return {
		subject: "Docker cleanup for dokploy",
		previewText: "Docker cleanup for dokploy",
		headingText: "Docker cleanup for dokploy",
		greeting: "Hello,",
		bodyText:
			"The docker cleanup for dokploy was successful ✅",
		detailsLabel: "Details:",
		messageLabel: "Message:",
		dateLabel: "Date:",
	};
};

export type DokployRestartEmailContent = {
	subject: string;
	previewText: string;
	headingText: string;
	greeting: string;
	bodyText: string;
	detailsLabel: string;
	dateLabel: string;
};

export const getDokployRestartEmailContent = (params: {
	date: string;
	locale?: EmailLocale;
}): DokployRestartEmailContent => {
	const locale = params.locale ?? getBackendLocale();

	if (locale === "zh-Hans") {
		return {
			subject: "Dokploy 服务已重启",
			previewText: "你的 Dokploy 服务器已重启",
			headingText: "Dokploy 服务器重启",
			greeting: "你好，",
			bodyText: "你的 Dokploy 服务器已成功重启 ✅",
			detailsLabel: "详情：",
			dateLabel: "时间：",
		};
	}

	return {
		subject: "Dokploy Server Restarted",
		previewText: "Your dokploy server was restarted",
		headingText: "Dokploy Server Restart",
		greeting: "Hello,",
		bodyText: "Your dokploy server was restarted ✅",
		detailsLabel: "Details:",
		dateLabel: "Date:",
	};
};

