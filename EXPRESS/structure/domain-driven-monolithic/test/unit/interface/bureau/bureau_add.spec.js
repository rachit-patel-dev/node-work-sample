/* eslint-env mocha */
let token
describe('Routes: Add-bureaus', () => {
    beforeEach(async () => {
        await dbReset();
        const user = await mocking.testUser()
        token = await mocking.authToken(user);
    })
    it('should add bureaus', done => {
        let bureauDetails = {
            "Email": "test1@yopmail.com",
            "LegalName": "test-legal-name",
            "PrimaryContact": "9912839744",
            "PrimaryContactPhoneNumber": "1478546324",
            "PrimaryContactMobile": "1478546324",
            "Address": "test address",
            "City": "xyz",
            "State": "test-state",
            "Country": "test-city",
            "Zip": "25457",
        }
        request.post(`${BASE_URI}/bureau`)
            .set('Authorization', `JWT ${token}`)
            .send(bureauDetails)
            .expect(200)
            .end((err, res) => {
                expect(res.body.success).to.eql(true)
                done(err)
            })
    })
    it('should add bureaus unauthorized', done => {

        let bureauDetails = {
            "Email": "test1@yopmail.com",
            "LegalName": "test-legal-name",
            "PrimaryContact": "9912839744",
            "PrimaryContactPhoneNumber": "1478546324",
            "PrimaryContactMobile": "1478546324",
            "Address": "test address",
            "City": "xyz",
            "State": "test-state",
            "Country": "test-city",
            "Zip": "25457",
        }
        request.post(`${BASE_URI}/bureau`)
            .send(bureauDetails)
            .expect(401)
            .end((err, res) => {
                expect(res.body.success).to.eql(false)
                done(err)
            })
    })
})