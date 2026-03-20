import { sessionClient, type SessionClient } from './clients';

export const sessionService: SessionClient = {
  addXP: (user, amount) => sessionClient.addXP(user, amount),
  authenticate: (email, password, isSignUp, role, displayName) => (
    sessionClient.authenticate(email, password, isSignUp, role, displayName)
  ),
  clearSession: () => sessionClient.clearSession(),
  getSession: () => sessionClient.getSession(),
  login: (role, demoPassword, organizationRole) => sessionClient.login(role, demoPassword, organizationRole),
  saveSession: (user) => sessionClient.saveSession(user),
  updateSessionUser: (user) => sessionClient.updateSessionUser(user),
};

export default sessionService;
