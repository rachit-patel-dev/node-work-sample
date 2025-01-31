const config = require('../../../config');
const BureauCreateSerializer = [
  {
    name: "Email",
    maxLength: 80,
    minLength: 10,
    type: "string",
    regex: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
    required: true,
  },
  {
    name: "LegalName",
    minLength: 1,
    type: "string",
    required: true,
  },
  {
    name: "PrimaryContact",
    minLength: 1,
    type: "string"
  },
  {
    name: "PrimaryContactPhoneNumber",
    minLength: 10,
    regex: config.phoneNumberRegex,
    type: "string"
  },
  {
    name: "PrimaryContactMobile",
    regex: config.phoneNumberRegex,
    minLength: 10,
    type: "string"
  },
  {
    name: "Address",
    minLength: 1,
    type: "string",
  },
  {
    name: "City",
    minLength: 1,
    type: "string"
  },
  {
    name: "State",
    minLength: 1,
    type: "string"
  },
  {
    name: "Country",
    minLength: 1,
    type: "string"
  },
  {
    name: "Zip",
    maxLength: 5,
    minLength: 5,
    regex: /^[0-9]+$/,
    type: "string"
  },
  {
    name: "PayrollSoftware",
    maxLength: 50,
    minLength: 1,
    type: {
      ASC: "ACS",
      ACCOUNTS_WORLD: "Accountants World",
      APEX: "Apex",
      ASSURE: "Assure",
      EXCUPAY: "Excupay",
      ISOLVED: "iSolved",
      UKG: "UKG"
    },
  }
];


module.exports = {
  BureauCreateSerializer
}