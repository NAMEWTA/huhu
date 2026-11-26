import { z } from "zod";

export type MailSecurity = "tls" | "starttls" | "none";
export type MailAuth = "password" | "app-password" | "oauth2";

export interface MailEndpoint {
  host: string;
  port: number;
  security: MailSecurity;
}

interface CredentialGuide {
  method: MailAuth;
  label: string;
}

const appPassword = { method: "app-password", label: "应用密码" } as const;
const loginPassword = { method: "password", label: "邮箱密码" } as const;
const authCode = { method: "app-password", label: "客户端授权码" } as const;
const clientPassword = { method: "app-password", label: "客户端专用密码" } as const;
const enterprisePassword = { method: "password", label: "邮箱密码或客户端专用密码" } as const;

// Defaults follow Issue #8 §3.1. The paired endpoints below share the suffix
// unless the provider uses a different submission hostname.
function preset(label: string, credential: CredentialGuide, suffix: string, smtp: MailEndpoint = { host: `smtp.${suffix}`, port: 465, security: "tls" }) {
  return {
    label,
    credential,
    imap: { host: suffix ? `imap.${suffix}` : "", port: 993, security: "tls" } satisfies MailEndpoint,
    smtp,
  };
}

const presets = {
  gmail: preset("Gmail", { method: "oauth2", label: "Google 授权" }, "gmail.com"),
  yahoo: preset("Yahoo", appPassword, "mail.yahoo.com"),
  aliyun: preset("阿里邮箱", clientPassword, "aliyun.com"),
  aliyun_enterprise: preset("阿里企业邮箱", enterprisePassword, "qiye.aliyun.com"),
  "189": preset("189 邮箱", loginPassword, "189.cn"),
  sohu: preset("搜狐邮箱", { method: "app-password", label: "独立密码" }, "sohu.com"),
  qq: preset("QQ / Foxmail", authCode, "qq.com"),
  tencent_enterprise: preset("腾讯企业邮", enterprisePassword, "exmail.qq.com"),
  "163": preset("网易 163", authCode, "163.com"),
  outlook: {
    ...preset("Outlook / Hotmail", { method: "oauth2", label: "Microsoft 授权" }, "office365.com", { host: "smtp.office365.com", port: 587, security: "starttls" }),
    imap: { host: "outlook.office365.com", port: 993, security: "tls" } satisfies MailEndpoint,
  },
  sina: preset("新浪邮箱", authCode, "sina.com"),
  "139": preset("139 邮箱", clientPassword, "139.com"),
  "21cn": preset("21CN 邮箱", loginPassword, "21cn.com"),
  perfect: preset("完美邮箱", { method: "app-password", label: "邮箱专用密码" }, "88.com"),
  icloud: preset("iCloud", { method: "app-password", label: "App 专用密码" }, "mail.me.com", { host: "smtp.mail.me.com", port: 587, security: "starttls" }),
  aol: preset("AOL", appPassword, "aol.com"),
  yandex: preset("Yandex", appPassword, "yandex.com"),
  mailru: preset("Mail.ru", appPassword, "mail.ru"),
  custom_imap: preset("自定义 IMAP/SMTP", { method: "password", label: "邮箱密码或客户端授权码" }, "", { host: "", port: 465, security: "tls" }),
};

export const mailProviderSchema = z.enum(Object.keys(presets) as [keyof typeof presets, ...(keyof typeof presets)[]]);
export type MailProvider = z.infer<typeof mailProviderSchema>;

const guideUrl = "https://huzhihui.com/blog/personal-email-account-add-guide-imap-smtp-app-password";
const googleAppPasswordUrl = "https://support.google.com/accounts/answer/185833";
const outlookSettingsUrl = "https://support.microsoft.com/en-us/outlook/pop-imap-and-smtp-settings-for-outlook-com";

/** Resolves defaults for a new form. The saved form never reapplies defaults. */
export function mailPreset(provider: MailProvider, email = "") {
  const { label, credential, imap, smtp } = presets[provider];
  const domain = email.trim().toLowerCase().split("@").at(-1);
  const perfectDomain = provider === "perfect" && email.includes("@") && (domain === "111.com" || domain === "email.cn") ? domain : undefined;
  return {
    provider,
    label,
    imap: { ...imap, host: perfectDomain ? `imap.${perfectDomain}` : imap.host },
    smtp: { ...smtp, host: perfectDomain ? `smtp.${perfectDomain}` : smtp.host },
    smtpEnabled: true,
    credentials: provider === "gmail" ? [{ ...credential }, { ...appPassword, label: "Gmail 应用密码" }] : [{ ...credential }],
    hint:
      provider === "gmail"
        ? "优先使用 Google 授权。账号允许时，可开启两步验证并使用应用密码。"
        : provider === "outlook"
          ? "使用 Microsoft 授权，并在邮箱设置中启用 IMAP。个人 Outlook.com 账号可按官方设置覆盖 SMTP 主机。"
          : provider === "custom_imap"
            ? "按服务商说明填写服务器和安全模式。只收件时可关闭 SMTP。"
            : `在邮箱设置中开启 IMAP，需要发件时开启 SMTP，并准备${credential.label}。`,
    guideUrl: provider === "gmail" ? googleAppPasswordUrl : provider === "outlook" ? outlookSettingsUrl : guideUrl,
  };
}
