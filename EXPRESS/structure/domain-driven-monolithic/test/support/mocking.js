/**
 * Description: This function is used for testing purposes. It creates a test user or a test bureau and returns the created user or bureau details.
 * 
 * Parameters:
 * - container: The container object used for dependency injection.
 * - config: The configuration object.
 * 
 * Returns:
 * - An object containing the following functions:
 *   - testUser: A function that creates a test user and returns the created user details.
 *   - authToken: A function that generates an authentication token for a given user.
 *   - testBureau: A function that creates a test bureau and returns the created bureau details.
 */
module.exports = (container, config) => {
    const { userRepository, bureauRepository } = container.resolve('repository')
    const signIn = container.resolve('jwt').signin()

    const testUser = async (credentials = null, isBureau = false) => {
        if (!credentials) {
            return await userRepository.create({
                Email: 'testdev1@gmail.com',
                LegalName: "test_legal_name",
                Password: 'test@123',
                Type: isBureau ? "Bureau" : "ADMIN",
                IsActive: 1,
            })
        } else {
            return await userRepository.create(credentials)
        }
    }

    const authToken = async (user, useCase = null) => {
        return signIn({
            ID: user.ID,
            Email: user.Email,
            Type: user.Type,
            useCase: !useCase ? config.passwordChangeUseCase : useCase
        })
    }

    const testBureau = async () => {
        let bureauDetails = {
            "PrimaryContact": "9912839744",
            "PrimaryContactPhoneNumber": "1478546324",
            "PrimaryContactMobile": "1478546324",
            "Address": "test address",
            "City": "xyz",
            "State": "test-state",
            "Country": "test-city",
            "Zip": "25457",
        }
        let userData = {
            Email: `test_bureau${Math.random()}@yopmail.com`,
            LegalName: "test-legal-name",
            Password: 'test@123',
            Type: "Bureau",
            IsActive: 1,
        }
        let user = await testUser(userData)
        bureauDetails.UsersID = user.ID
        return await bureauRepository.create(bureauDetails)
    }
    return {
        testUser,
        authToken,
        testBureau
    }
}