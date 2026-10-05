import type { ApiRouteDefinition } from './runtime';
import { productFeedbackRoutes } from './product-feedback';
import { aiRoutes } from './ai';
import { analyticsRoutes } from './analytics';
import { authProfileRoutes } from './auth-profile';
import { guestTrialRoutes } from './guest-trial';
import { guestLearningRoutes } from './guest-learning';
import { publicCommercialRoutes } from './public-commercial';
import { runtimeAdminRoutes } from './runtime-admin';
import { storageRoutes } from './storage';
import { wordHintRoutes } from './word-hints';
import { writingRoutes } from './writing';

export const apiRoutes: ApiRouteDefinition[] = [
  ...productFeedbackRoutes,
  ...analyticsRoutes,
  ...authProfileRoutes,
  ...guestTrialRoutes,
  ...guestLearningRoutes,
  ...publicCommercialRoutes,
  ...runtimeAdminRoutes,
  ...writingRoutes,
  ...storageRoutes,
  ...wordHintRoutes,
  ...aiRoutes,
];
