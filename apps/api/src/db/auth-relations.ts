import { relations } from "drizzle-orm";
import {
  account,
  invitation,
  member,
  organization,
  session,
  team,
  teamMember,
  user,
} from "./identity-schema";
import {
  oauthAccessToken,
  oauthClient,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
} from "./oauth-schema";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  teamMembers: many(teamMember),
  members: many(member),
  invitations: many(invitation),
  oauthClients: many(oauthClient),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
}));

export const sessionRelations = relations(session, ({ one, many }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  teams: many(team),
  members: many(member),
  invitations: many(invitation),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, {
    fields: [team.organizationId],
    references: [organization.id],
  }),
  teamMembers: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const oauthClientRelations = relations(oauthClient, ({ one, many }) => ({
  user: one(user, {
    fields: [oauthClient.userId],
    references: [user.id],
  }),
  oauthClientResources: many(oauthClientResource),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
}));

export const oauthResourceRelations = relations(oauthResource, ({ many }) => ({
  oauthClientResources: many(oauthClientResource),
}));

export const oauthClientResourceRelations = relations(oauthClientResource, ({ one }) => ({
  oauthClient: one(oauthClient, {
    fields: [oauthClientResource.clientId],
    references: [oauthClient.clientId],
  }),
  oauthResource: one(oauthResource, {
    fields: [oauthClientResource.resourceId],
    references: [oauthResource.identifier],
  }),
}));

export const oauthRefreshTokenRelations = relations(oauthRefreshToken, ({ one, many }) => ({
  oauthClient: one(oauthClient, {
    fields: [oauthRefreshToken.clientId],
    references: [oauthClient.clientId],
  }),
  session: one(session, {
    fields: [oauthRefreshToken.sessionId],
    references: [session.id],
  }),
  user: one(user, {
    fields: [oauthRefreshToken.userId],
    references: [user.id],
  }),
  oauthAccessTokens: many(oauthAccessToken),
}));

export const oauthAccessTokenRelations = relations(oauthAccessToken, ({ one }) => ({
  oauthClient: one(oauthClient, {
    fields: [oauthAccessToken.clientId],
    references: [oauthClient.clientId],
  }),
  session: one(session, {
    fields: [oauthAccessToken.sessionId],
    references: [session.id],
  }),
  user: one(user, {
    fields: [oauthAccessToken.userId],
    references: [user.id],
  }),
  oauthRefreshToken: one(oauthRefreshToken, {
    fields: [oauthAccessToken.refreshId],
    references: [oauthRefreshToken.id],
  }),
}));

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
  oauthClient: one(oauthClient, {
    fields: [oauthConsent.clientId],
    references: [oauthClient.clientId],
  }),
  user: one(user, {
    fields: [oauthConsent.userId],
    references: [user.id],
  }),
}));
