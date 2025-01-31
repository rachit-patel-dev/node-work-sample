/* eslint-env mocha */
let token
let bureauId
describe('Routes: master csv upload', () => {
    beforeEach(async () => {
        await dbReset();
        const user = await mocking.testUser()
        const bureau = await mocking.testBureau()
        bureauId = bureau.ID
        token = await mocking.authToken(user);
    })
    it('should upload master csv', done => {
        request.post(`${BASE_URI}/user/upload/master-csv`)
            .set('Authorization', `JWT ${token}`)
            .attach('MasterCsv', __dirname + '/master.csv')
            .expect(200)
            .end((err, res) => {
                expect(res.body.success).to.eql(true)
                done(err)
            })
    })
    it('should get unauthorized while upload master csv', done => {
        request.post(`${BASE_URI}/user/upload/master-csv`)
            .attach('MasterCsv', __dirname + '/master.csv')
            .expect(401)
            .end((err, res) => {
                expect(res.body.success).to.eql(false)
                done(err)
            })
    })
})