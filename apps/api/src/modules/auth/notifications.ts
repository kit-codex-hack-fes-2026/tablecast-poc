import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import type { MailEnv } from "../../emails/send";
import { user } from "../../db/identity-schema";
import {
  invitationEmail,
  invitationStatusEmail,
  securityEmail,
} from "../../emails/account-content";
import { sendAccountEmail } from "../../emails/send";

export function authNotifications(env: MailEnv, db: Database, criticalMailTasks: Promise<void>[]) {
  const accountUrl = `${env.TABLECAST_PUBLIC_ORIGIN}/account`;
  async function notify(to: string, content: Parameters<typeof sendAccountEmail>[2]) {
    try {
      await sendAccountEmail(env, to, content);
    } catch {
      console.error("TABLECAST_ACCOUNT_NOTIFICATION_FAILED");
    }
  }
  async function recipient(userId: string) {
    return db
      .select({ email: user.email, locale: user.locale })
      .from(user)
      .where(eq(user.id, userId))
      .get();
  }
  async function invitationStatus(
    data: { invitation: { email: string; inviterId: string }; organization: { name: string } },
    status: "accepted" | "canceled" | "rejected",
  ) {
    try {
      const { invitation, organization } = data;
      const inviter = await recipient(invitation.inviterId);
      const invitee = await db
        .select({ locale: user.locale })
        .from(user)
        .where(eq(user.email, invitation.email))
        .get();
      const url = `${env.TABLECAST_PUBLIC_ORIGIN}/organisations`;
      if (status !== "rejected")
        await notify(
          invitation.email,
          invitationStatusEmail(organization.name, status, invitation.email, url, invitee?.locale),
        );
      if (status !== "canceled" && inviter)
        await notify(
          inviter.email,
          invitationStatusEmail(organization.name, status, invitation.email, url, inviter.locale),
        );
    } catch {
      console.error("TABLECAST_ACCOUNT_NOTIFICATION_FAILED");
    }
  }
  return {
    organization: {
      sendInvitationEmail: (data: {
        email: string;
        id: string;
        invitation: { expiresAt: Date };
        inviter: { user: { email: string; name: string } };
        organization: { name: string };
        role: string;
      }) => {
        const delivery = (async () => {
          const invitee = await db
            .select({ locale: user.locale })
            .from(user)
            .where(eq(user.email, data.email))
            .get();
          await sendAccountEmail(
            env,
            data.email,
            invitationEmail(
              data.organization.name,
              `${env.TABLECAST_PUBLIC_ORIGIN}/invitations/${data.id}`,
              {
                inviter: `${data.inviter.user.name} <${data.inviter.user.email}>`,
                role: data.role,
                expiresAt: data.invitation.expiresAt,
              },
              invitee?.locale,
            ),
          );
        })();
        criticalMailTasks.push(delivery);
        return delivery;
      },
      organizationHooks: {
        afterAcceptInvitation: (data: Parameters<typeof invitationStatus>[0]) =>
          invitationStatus(data, "accepted"),
        afterRejectInvitation: (data: Parameters<typeof invitationStatus>[0]) =>
          invitationStatus(data, "rejected"),
        afterCancelInvitation: (data: Parameters<typeof invitationStatus>[0]) =>
          invitationStatus(data, "canceled"),
      },
    },
    security: async (userId: string, event: Parameters<typeof securityEmail>[0]) => {
      try {
        const target = await recipient(userId);
        if (target) await notify(target.email, securityEmail(event, accountUrl, target.locale));
      } catch {
        console.error("TABLECAST_ACCOUNT_NOTIFICATION_FAILED");
      }
    },
  };
}
