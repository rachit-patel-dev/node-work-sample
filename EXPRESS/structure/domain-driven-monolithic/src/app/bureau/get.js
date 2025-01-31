const Sequelize = require("sequelize");
const { paginator } = require('../../infra/utils/customPaginator')
const database = require('../../infra/database')

/**
 * Description: This function retrieves a list of bureaus based on the provided query parameters.
 * 
 * Parameters:
 * - req: The request object containing query parameters.
 * 
 * Returns:
 * - Promise: A promise that resolves to an object containing the retrieved bureaus, a success message, and pagination metadata.
 * 
 * Throws:
 * - If an error occurs during the retrieval process, a rejection with an error message is thrown.
 */
module.exports = ({ bureauRepository, sourceFileRepository, config, logger }) => {
  const databaseObj = database({ config, logger })
  const users = databaseObj.models.Users
  const all = (req) => {
    return new Promise(async (resolve, reject) => {
      try {
        const Status = req.query.Status || null;
        const limit = parseInt(req.query.PageSize) || config.pageSize;
        const pageNumber = parseInt(req.query.PageNumber) || 0;
        const offset = parseInt(req.query.PageNumber) * parseInt(req.query.PageSize) || 0;
        let queryParameters = {
          limit,
          offset,
          where: {
            IsActive: 1
          },
          include: [{
            model: users,
            attributes: [
              'ID', 'Email', 'LegalName', 'IsActive', 'createdAt', 'updatedAt'],
          }],
          attributes: [
            'ID', 'PrimaryContact', 'EmployerCount', 'UsersID', 'PrimaryContactPhoneNumber', 'PayrollSoftware', 'PrimaryContactMobile', 'Address', 'City', 'State', 'Country', 'Zip', 'Status', 'IsActive', 'CreatedAt', 'UpdatedAt'
          ],
          order: [["CreatedAt", "DESC"]]
        }
        const SortBy = req.query.SortBy || null;
        const OrderBy = req.query.OrderBy || null;
        const Search = req.query.Search || null;
        if (SortBy && OrderBy) {
          if (SortBy === "LegalName") {
            queryParameters.include[0].order = [[SortBy, OrderBy]];
          } else {
            queryParameters.order = [[SortBy, OrderBy]];
          }
        }
        let isSearchable = false;
        const searchClaus = { [Sequelize.Op.like]: `%${Search}%` };
        let countQueryParams = {
          where: {},
          include: [{
            model: users,
            attributes: [
              'ID', 'Email', 'LegalName', 'IsActive', 'createdAt', 'updatedAt'],
          }],
        }
        // TODO not working the search functionality
        if (Search) {
          if (/\b(?:Active|Pending|Blocked)\b/i.test(Search)) {
            queryParameters.where = {
              ...queryParameters.where,
              [Sequelize.Op.or]: [
                { Status: searchClaus }
              ],
            };
            countQueryParams.where = {
              ...countQueryParams.where,
              [Sequelize.Op.or]: [
                { Status: searchClaus }
              ],
            }
          } else {
            queryParameters.include[0].where = {
              [Sequelize.Op.or]: [
                { LegalName: searchClaus },
                { CreatedAt: searchClaus },

              ],
            };
            countQueryParams.include[0].where = {
              [Sequelize.Op.or]: [
                { LegalName: searchClaus },
                { CreatedAt: searchClaus },
              ],
            }
          }
          isSearchable = true;
        }
        if (Status) {
          queryParameters.where = {
            ...queryParameters.where,
            Status: Status,
          };
        }
        let data = await bureauRepository.getAll(queryParameters);
        const promises = data.map(async (element) => {
          return element.EmployerCount = await databaseObj.models.Employers.count({ where: { BureausID: element.ID, IsActive: 1 } })
        });
        await Promise.all(promises);
        const count = data.length;
        const totalCount = await bureauRepository.countAll(countQueryParams);
        const paginateMeta = await paginator(req, totalCount, limit, count, pageNumber, isSearchable)
        resolve({
          data,
          message: config.messages.success.listBureau,
          paginateMeta,
        });
      } catch (err) {
        logger.error(err.message);
        const data = {};
        const error = config.messages.error.listBureau;
        reject({ data, error });
      }
    });
  };


  return {
    all
  }
}
