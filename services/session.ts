import { sessionClient, type SessionClient } from './clients';

export const sessionService: SessionClient = {
  addXP: (user, amount) => sessionClient.addXP(user, amount),
  authenticate: (email, password, isSignUp, role, displayName, loginEntry) => (
    sessionClient.authenticate(email, password, isSignUp, role, displayName, loginEntry)
  ),
  requestPasswordRecovery: (email, source) => sessionClient.requestPasswordRecovery(email, source),
  confirmPasswordReset: (token, password) => sessionClient.confirmPasswordReset(token, password),
  clearSession: () => sessionClient.clearSession(),
  getSession: () => sessionClient.getSession(),
  login: (role, demoPassword, organizationRole) => sessionClient.login(role, demoPassword, organizationRole),
  saveSession: (user) => sessionClient.saveSession(user),
  updateSessionUser: (user) => sessionClient.updateSessionUser(user),
};

export default sessionService;
