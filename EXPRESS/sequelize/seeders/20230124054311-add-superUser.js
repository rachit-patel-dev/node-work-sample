'use strict';
require('dotenv').config();
const { encryptPassword } = require('../../encryption/index')

const moment = require('moment')

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Add superuser.
     *
    */
    await queryInterface.bulkInsert('Users', [{
      Email: process.env.SUPER_USER,
      Password: encryptPassword(process.env.SUPER_PASSWORD),
      LegalName: "John Doe",
      Type: 'ADMIN',
      IsActive: true,
      CreatedAt: moment.utc().toDate(),
      UpdatedAt: moment.utc().toDate()

    }], {});
  },
  
  async down(queryInterface, Sequelize) {

  }
};
