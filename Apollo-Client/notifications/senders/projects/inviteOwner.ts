/*external modules*
/*DB*/
import { pool, sql } from '../../../db';
import { Project, PROJECT_TABLE } from '../../../db/types/project';
import { Invite, INVITE_TABLE } from '../../../db/types/invite';
import { Contract, CONTRACT_TABLE } from '../../../db/types/contract';
import { User, USER_TABLE } from '../../../db/types/user';
import { ROLE_TABLE } from '../../../db/types/role';
/*GQL*/
/*other*/
import { Sender, SenderEmails } from '..';
import { config } from '../../../config';
import _ from 'lodash';

type TArgs = {
  projectId: string;
  message: string;
};

/**
 * @deprecated
 * @param args
 */

export const projectInviteOwner: Sender<TArgs> = async args => {
  const { projectId, message } = args;
  const {
    rows: [project]
  } = await pool.query<
    Project & {
      owner: Required<Pick<User, 'email' | 'firstName' | 'lastName'>> & Partial<Pick<Invite, 'key'>>;
      partner: Pick<User, 'firstName' | 'lastName'>;
      contract: Contract;
    }
  >(
    sql`
      SELECT projects.*,
             json_build_object(
              'email', coalesce(ousers."email", invites."email"),
              'firstName', coalesce(ousers."firstName", invites."firstName"),
              'lastName', coalesce(ousers."lastName", invites."lastName"),
              'key', invites."key"
             ) AS "owner",
             json_build_object(
              'firstName', pusers."firstName",
              'lastName', pusers."lastName"
             ) AS "partner",
             row_to_json(contracts.*) AS "contract"
      FROM ${PROJECT_TABLE} projects
        LEFT JOIN ${INVITE_TABLE} invites ON (invites."id" = projects."ownerInviteId")
        LEFT JOIN ${ROLE_TABLE} oroles ON (oroles."id" = projects."ownerId")
        LEFT JOIN ${USER_TABLE} ousers ON (ousers."id" = oroles."userId")
        INNER JOIN ${CONTRACT_TABLE} contracts ON (contracts."projectId" = projects."id")
        INNER JOIN ${ROLE_TABLE} proles ON (proles."id" = contracts."partnerId")
        INNER JOIN ${USER_TABLE} pusers ON (pusers."id" = proles."userId")
      WHERE projects."id" = ${projectId}`
  );

  const owner = project.owner;
  const address = _.get(_.split(project.contract.name, '/'), 0);
  const projectName = _.get(_.split(address, ','), 0);
  const inviterName = `${project.partner.firstName} ${project.partner.lastName}`;
  const inviteeName = `${owner.firstName} ${owner.lastName}`;

  const url = owner.key && !project.ownerId ? `invites/${owner.key}` : `estimate/${project.contract.id}`;
  const btnText = owner.key && !project.ownerId ? `Join Now` : `View`;

  const emails: SenderEmails = [
    {
      to: owner.email,
      template: 'projects/invite-owner',
      subject: `You invited to project ${projectName}`,
      locals: {
        inviteeName,
        inviterName,
        projectName,
        message,
        btnText,
        url: config.utils.clientUrl(url)
      }
    }
  ];

  return {
    subscriptions: [
      ['contractsUpdated', project.contract],
      ['projectsUpdated', project]
    ],
    emails
  };
};
