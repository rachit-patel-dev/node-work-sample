const Status = require('http-status')
const { Router } = require('express')

module.exports = ({
  getUseCase,
  postUseCase,
  putUseCase,
  deleteUseCase,
  logger,
  auth,
  uploader,
  config,
  response: { Success, Fail }
}) => {
  const router = Router()
  /**
 * @swagger
 * definitions:
 *   bureau:
 *     properties:
 *       id:
 *         type: string
 *         format: uuid
 *       name:
 *         type: string
 *       address:
 *         type: string
 *       contact:
 *         type: string
 *       tin:
 *         type: string
 *       sss:
 *         type: string
 *       philhealth:
 *         type: string
 *       isDeleted:
 *         type: number
 *       createdBy:
 *         type: string
 *         format: uuid
 */

  router.use(auth.tokenAuthenticate, auth.isAdminAuthenticate)

  /**
* @swagger
* /bureaus:
*   get:
*     tags:
*       - Companies
*     description: Returns a list of bureaus
*     security:
*       - JWT: []
*     responses:
*       200:
*         description: An array of bureaus
*         schema:
*           type: array
*           items:
*             $ref: '#/definitions/bureau'
*       401:
*        $ref: '#/responses/Unauthorized'
*/
  router
    .get('/', (req, res) => {
      getUseCase
        .all(req)
        .then((result) => {
          res.status(Status.OK).json(Success(result.data, result.message, true, result.paginateMeta))
        })
        .catch((error) => {
          logger.error(error) 
          res.status(Status.BAD_REQUEST).json(
            Fail({}, error.message))
        })
    })


  /**
* @swagger
* /bureaus:
*   get:
*     tags:
*       - Companies
*     description: Returns a list of bureaus
*     security:
*       - JWT: []
*     responses:
*       200:
*         description: An array of bureaus
*         schema:
*           type: array
*           items:
*             $ref: '#/definitions/bureau'
*       401:
*        $ref: '#/responses/Unauthorized'
*/
  router
    .get('/:id', (req, res) => {
      getUseCase
        .getById({ ID: req.params.id })
        .then((result) => {
          res.status(Status.OK).json(Success(result.data, result.message))
        })
        .catch((result) => {
          logger.error(error) 
          res.status(Status.BAD_REQUEST).json(
            Fail(result.data, result.error))
        })
    })
  /**
* @swagger
* /bureaus:
*   post:
*     tags:
*       - Bureaus
*     description: Create new bureau
*     security:
*       - JWT: []
*     produces:
*       - application/json
*     parameters:
*       - name: body
*         description: Bureau's Entity
*         in: body
*         required: true
*         type: string
*         schema:
*           $ref: '#/definitions/bureau'
*     responses:
*       200:
*         description: Successfully Created
*         schema:
*           $ref: '#/definitions/bureau'
*       401:
*         $ref: '#/responses/Unauthorized'
*       400:
*         $ref: '#/responses/BadRequest'
*/
  router
    .post('/', uploader(config.mediaRoot + '/media/csv').single('SampleFile'), (req, res) => {
      postUseCase
        .create({ body: req.body, SampleFile: req.file })
        .then((result) => {
          res.status(Status.OK).json(Success(result.data, result.message))
        })
        .catch((result) => {
          res.status(Status.BAD_REQUEST).json(
            Fail(result.data, result.error))
        })
    })

  /**
* @swagger
* /bureaus:
*   post:
*     tags:
*       - Bureaus
*     description: Create new bureau
*     security:
*       - JWT: []
*     produces:
*       - application/json
*     parameters:
*       - name: body
*         description: Bureau's Entity
*         in: body
*         required: true
*         type: string
*         schema:
*           $ref: '#/definitions/bureau'
*     responses:
*       200:
*         description: Successfully Created
*         schema:
*           $ref: '#/definitions/bureau'
*       401:
*         $ref: '#/responses/Unauthorized'
*       400:
*         $ref: '#/responses/BadRequest'
*/
  router
    .post('/:id/status-change', (req, res) => {
      postUseCase
        .statusChange({ body: req.body, id: req.params.id })
        .then((result) => {
          res.status(Status.OK).json(Success(result.data, result.message))
        })
        .catch((result) => {
          res.status(Status.BAD_REQUEST).json(
            Fail(result.data, result.error))
        })
    })


  /**
* @swagger
* /bureaus:
*   post:
*     tags:
*       - Bureaus
*     description: Create new bureau
*     security:
*       - JWT: []
*     produces:
*       - application/json
*     parameters:
*       - name: body
*         description: Bureau's Entity
*         in: body
*         required: true
*         type: string
*         schema:
*           $ref: '#/definitions/bureau'
*     responses:
*       200:
*         description: Successfully Created
*         schema:
*           $ref: '#/definitions/bureau'
*       401:
*         $ref: '#/responses/Unauthorized'
*       400:
*         $ref: '#/responses/BadRequest'
*/
  router
    .post('/:id/invite', (req, res) => {
      postUseCase
        .inviteBureau({ ID: req.params.id })
        .then((result) => {
          res.status(Status.OK).json(Success(result.data, result.message))
        })
        .catch((result) => {
          res.status(Status.BAD_REQUEST).json(
            Fail(result.data, result.error))
        })
    })

  /**
 * @swagger
 * /companies:
 *   put:
 *     tags:
 *       - Companies
 *     description: Update Bureau
 *     security:
 *       - JWT: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Bureau's ID to update
 *         type: string
 *       - name: body
 *         description: Bureau's Entity
 *         in: body
 *         required: true
 *         type: string
 *         schema:
 *           $ref: '#/definitions/bureau'
 *     responses:
 *       200:
 *         description: Successfully Updated
 *         schema:
 *           $ref: '#/definitions/bureau'
 *       401:
 *         $ref: '#/responses/Unauthorized'
 *       400:
 *         $ref: '#/responses/BadRequest'
 */
  router
    .put('/:id', uploader(config.mediaRoot + '/media/csv').single('SampleFile'), (req, res) => {
      putUseCase
        .update({ ID: req.params.id, body: req.body, SampleFile: req.file })
        .then((result) => {
          res.status(Status.OK).json(Success(result.data, result.message))
        })
        .catch((result) => {
          logger.error(result.error) 
          res.status(Status.BAD_REQUEST).json(
            Fail(result.data, result.error))
        })
    })

  /**
 * @swagger
 * /companies:
 *   delete:
 *     tags:
 *       - Companies
 *     description: Delete bureau
 *     security:
 *       - JWT: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: bureau's ID to delete
 *         type: string
 *     responses:
 *       200:
 *         description: Successfully Deleted
 *         schema:
 *           $ref: '#/definitions/bureau'
 *       401:
 *         $ref: '#/responses/Unauthorized'
 */
  router
    .delete('/:id', (req, res) => {
      deleteUseCase
        .remove({ ID: req.params.id })
        .then(result => {
          res.status(Status.OK).json(Success(result.data, result.message))
        })
        .catch((error) => {
          logger.error(error) 
          res.status(Status.BAD_REQUEST).json(
            Fail(error.data, error.message))
        })
    })
  return router
}
