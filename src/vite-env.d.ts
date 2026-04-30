// eslint-disable-next-line spaced-comment
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_ARK_SERVER?: string
  readonly VITE_BOLTZ_URL?: string
  // Chimera API
  readonly VITE_CHIMERA_API?: string
  // App URLs
  readonly VITE_GIFT_CARDS_URL?: string
  readonly VITE_GIFT_CARDS_BUY_URL?: string
  readonly VITE_GIFT_CARDS_REDEEM_URL?: string
  readonly VITE_CARD_RESERVATION_URL?: string
  readonly VITE_STATEMENT_URL?: string
  readonly VITE_REFERRAL_URL?: string
  // KYC/IDFlow URLs
  readonly VITE_KYC_WEBVIEW_URL?: string
  readonly VITE_KYC_API_URL?: string
  // ChatWoot
  readonly VITE_CHATWOOT_WEBSITE_TOKEN?: string
  readonly VITE_CHATWOOT_BASE_URL?: string
  // Third-party integrations
  readonly VITE_LENDASAT_IFRAME_URL?: string
  readonly VITE_LENDASWAP_IFRAME_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Navigator {
  standalone?: boolean
}

// Build-time constants injected by Vite
declare const __BUILD_TIME__: string
