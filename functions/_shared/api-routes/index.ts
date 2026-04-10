import type { ApiRouteDefinition } from './runtime';
import { aiRoutes } from './ai';
import { analyticsRoutes } from './analytics';
import { authProfileRoutes } from './auth-profile';
import { publicCommercialRoutes } from './public-commercial';
import { runtimeAdminRoutes } from './runtime-admin';
import { storageRoutes } from './storage';
import { wordHintRoutes } from './word-hints';
import { writingRoutes } from './writing';

export const apiRoutes: ApiRouteDefinition[] = [
  ...analyticsRoutes,
  ...authProfileRoutes,
  ...publicCommercialRoutes,
  ...runtimeAdminRoutes,
  ...writingRoutes,
  ...storageRoutes,
  ...wordHintRoutes,
  ...aiRoutes,
];
