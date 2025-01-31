require('dotenv').config();
const inquirer = require('inquirer');
const moment = require('moment');
const { encryptPassword } = require('../src/infra/encryption/index');
const { Sequelize } = require('sequelize');
const config = require('../config');

/**
 * Creates a super user with the provided user input.
 *
 * @async
 * @function createSuperUser
 * @throws {Error} If the password and conform password do not match.
 * @returns {Promise<void>} A promise that resolves when the super user is created successfully.
 */
const createSuperUser = async () => {
    const sequelize = new Sequelize(config.db.database, config.db.username, config.db.password, {
        host: config.db.host,
        port: config.db.port,
        dialect: config.db.dialect
    });

    const user = await getUserInput();
    user.Type = 'ADMIN';
    user.IsActive = true
    user.CreatedAt = moment.utc().toDate();
    user.UpdatedAt = moment.utc().toDate();

    if (user.ConformPassword === user.Password) {
        delete user.ConformPassword;
        user.Password = encryptPassword(user.Password);
        try {
            const result = await sequelize.queryInterface.bulkInsert('Users', [user], {});
            console.log(`Super user ${user.Email} is created successfully.`);
        } catch (error) {
            console.log(error.message);
        }
    } else {
        throw Error("Both password does not match.Please try again.")
    }
};

/**
 * Retrieves user input using the inquirer library.
 *
 * @returns {Promise<Object>} A promise that resolves to an object containing the user input.
 * @throws {Error} If the passwords entered by the user do not match.
 */
const getUserInput = async () => {
    const answers1 = await inquirer.prompt([
        {
            type: 'text',
            name: 'email',
            message: 'Enter Email:',
        },
    ]);

    const answers2 = await inquirer.prompt([
        {
            type: 'text',
            name: 'LegalName',
            message: 'Enter LegalName:',
        },
    ]);

    const answers3 = await inquirer.prompt([
        {
            type: 'password',
            name: 'Password',
            message: 'Enter Password:',
        },
    ]);

    const answers4 = await inquirer.prompt([
        {
            type: 'password',
            name: 'ConformPassword',
            message: 'Enter Conform-Password:',
        },
    ]);

    return {
        Email: answers1.email,
        LegalName: answers2.LegalName,
        Password: answers3.Password,
        ConformPassword: answers4.ConformPassword,
    };
};

createSuperUser();