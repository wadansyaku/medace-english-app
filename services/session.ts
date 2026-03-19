import { sessionStorage, type SessionStorageService } from './storage';

export const sessionService: SessionStorageService = {
  addXP: (user, amount) => sessionStorage.addXP(user, amount),
  authenticate: (email, password, isSignUp, role, displayName) => (
    sessionStorage.authenticate(email, password, isSignUp, role, displayName)
  ),
  clearSession: () => sessionStorage.clearSession(),
  getSession: () => sessionStorage.getSession(),
  login: (role, demoPassword, organizationRole) => sessionStorage.login(role, demoPassword, organizationRole),
  saveSession: (user) => sessionStorage.saveSession(user),
  updateSessionUser: (user) => sessionStorage.updateSessionUser(user),
};

export default sessionService;
