/*external modules*/
/*DB*/
import * as db from '../../index';
import { ChangeOrder, CHANGE_ORDER_TABLE, ChangeOrderStatus } from '../../types/changeOrder';
import { TASK_VERSION_TABLE } from '../../types/taskVersion';
/*DataLoaders*/
import DataLoader from '../DataLoader';
import BasicLoader from '../BasicLoader';
import { loaderByFieldMany, loaderByFieldManyThroughPivot } from '../helpers';

export type LoaderKeys = 'changeOrders' | 'changeOrdersByContract' | 'changeOrdersByTaskId' | 'openChangeOrderByTaskId';

/**
 * Represents a loader for Change Orders.
 *
 * This class extends the BasicLoader class and provides methods for loading Change Orders from the database.
 * It defines the table name and the main key for the loader, and also defines additional loaders and subsets.
 *
 * @class ChangeOrdersLoader
 * @extends BasicLoader<LoaderKeys, ChangeOrder | undefined>
 */
class ChangeOrdersLoader extends BasicLoader<LoaderKeys, ChangeOrder | undefined> {
  table = CHANGE_ORDER_TABLE;
  mainKey: LoaderKeys = 'changeOrders';

  constructor() {
    super();

    this.defMain(this.table);

    this.defSubset('changeOrdersByContract', mainLoader => {
      return loaderByFieldMany({
        table: CHANGE_ORDER_TABLE,
        field: 'contractId',
        mainLoader
      });
    });

    this.defLoader('changeOrdersByTaskId', () => {
      return loaderByFieldManyThroughPivot({
        pivotSearchField: 'taskId',
        pivotTable: TASK_VERSION_TABLE,
        pivotField: 'changeOrderId',
        targetTable: CHANGE_ORDER_TABLE,
        targetField: 'id'
      });
    });
    this.defLoader('openChangeOrderByTaskId', () => {
      return new DataLoader(async ids => {
        const { rows: results } = await db.pool.query<ChangeOrder & { taskId: string }>(
          //language=PostgreSQL
          db.sql`
            SELECT DISTINCT ON (task_versions."taskId") change_orders.*, task_versions."taskId"
            FROM ${CHANGE_ORDER_TABLE} change_orders
                INNER JOIN ${TASK_VERSION_TABLE} task_versions ON (task_versions."changeOrderId" = change_orders."id")
            WHERE task_versions."taskId" = ANY(${ids})
              AND change_orders."status" = ${ChangeOrderStatus.Open}
            ORDER BY task_versions."taskId", change_orders."no" DESC
          `
        );

        return ids.map(id => results.find(result => result.taskId === id));
      });
    });
  }
}

export default new ChangeOrdersLoader().loaders;
