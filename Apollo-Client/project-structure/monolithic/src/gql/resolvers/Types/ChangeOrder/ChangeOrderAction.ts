/*external modules*/
/*DB*/
import { ChangeOrder } from '../../../../db/types/changeOrder';
/*models*/
/*GQL*/
import { defType } from '../../..';
/*others*/

export enum ChangeOrderAction {
  'Created' = 'Created',
  'Approved' = 'Approved',
  'Declined' = 'Declined',
  'Deleted' = 'Deleted',
  'Edited' = 'Edited'
}

defType(`
  enum ChangeOrderAction {${Object.keys(ChangeOrderAction).join(' ')}}
`);

export interface ActionedChangeOrderDefault {
  action: ChangeOrderAction;
  changeOrder: ChangeOrder;
}

defType<ActionedChangeOrderDefault>(
  `type ActionedChangeOrderDefault {
    action: ChangeOrderAction!
    changeOrder: ChangeOrder!
  }`
);

export interface ActionedChangeOrderDeleted {
  action: ChangeOrderAction.Deleted;
  changeOrderId: string;
}

defType<ActionedChangeOrderDeleted>(
  `type ActionedChangeOrderDeleted {
    action: ChangeOrderAction!
    changeOrderId: ID!
  }`
);

export type ActionedChangeOrder = ActionedChangeOrderDefault | ActionedChangeOrderDeleted;

defType<any>(
  `
  union ActionedChangeOrder = ActionedChangeOrderDefault | ActionedChangeOrderDeleted
`,
  {
    
    /**
   * Resolves the type of the actioned change order based on the provided data.
   * 
   * @param data - The data containing the action of the change order.
   * @returns The type of the actioned change order.
   */
    __resolveType: async (data: { action: ChangeOrderAction }) => {
      switch (data.action) {
        case ChangeOrderAction.Deleted: {
          return 'ActionedChangeOrderDeleted';
        }
        default:
          return 'ActionedChangeOrderDefault';
      }
    }
  }
);
