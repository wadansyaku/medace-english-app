import type { ApiRouteDefinition } from './runtime';
import { aiRoutes } from './ai';
import { authProfileRoutes } from './auth-profile';
import { publicCommercialRoutes } from './public-commercial';
import { storageRoutes } from './storage';
import { writingRoutes } from './writing';

export const apiRoutes: ApiRouteDefinition[] = [
  ...authProfileRoutes,
  ...publicCommercialRoutes,
  ...writingRoutes,
  ...storageRoutes,
  ...aiRoutes,
];
