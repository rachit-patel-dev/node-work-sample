/**
 * Creates a Bureau model using Sequelize.
 * 
 * @param {Object} sequelize - The Sequelize instance.
 * @param {Object} DataTypes - The data types supported by Sequelize.
 * @returns {Object} - The Bureau model.
 */
module.exports = function (sequelize, DataTypes) {
  const Bureau = sequelize.define('Bureaus', {
    ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    UsersID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users', // 'Users' refers to table name
        key: 'ID', // 'ID' refers to column name in further table
      }
    },
    FederalID: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    PrimaryContact: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    PrimaryContactPhoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    PrimaryContactMobile: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    Address: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    City: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    State: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    Country: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    Zip: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    Status: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'Pending'
    },
    PayrollSoftware: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    EmployerCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    IsActive: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    freezeTableName: true,
    timestamps: true,
  })

  return Bureau
}
