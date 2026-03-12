export interface AppEnv {
  DB: any;
  WRITING_ASSETS?: any;
  WRITING_AI_MODE?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_OCR_MODEL?: string;
  OPENAI_EVAL_MODEL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_OCR_MODEL?: string;
  CLOUDFLARE_EVAL_MODEL?: string;
  ADMIN_DEMO_PASSWORD?: string;
  ENABLE_ADMIN_DEMO?: string;
  ENABLE_PUBLIC_BUSINESS_DEMO?: string;
  ENABLE_DESTRUCTIVE_ADMIN_ACTIONS?: string;
  APP_ONLINE_ONLY?: string;
}

export interface DbUserRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  role: string;
  grade: string | null;
  english_level: string | null;
  subscription_plan: string | null;
  organization_name: string | null;
  organization_role: string | null;
  study_mode: string | null;
  stats_xp: number | null;
  stats_level: number | null;
  stats_current_streak: number | null;
  stats_last_login_date: string | null;
}
