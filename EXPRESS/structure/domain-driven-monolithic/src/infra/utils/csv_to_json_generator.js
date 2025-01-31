const csvtojson = require('csvtojson');
const path = require('path');
const baseDir = path.join(__dirname, '../../../public/media/csv');

/**
 * Converts a CSV file to a JSON array.
 *
 * @param {string} pathName - The path to the CSV file.
 * @param {boolean} [fromAzure=false] - Indicates whether the CSV file is from Azure.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of JSON objects representing the CSV data.
 * @throws {Error} - If there is an error converting the CSV file to JSON.
 */
const csvToJson = async (pathName, fromAzure = false) => {
    if (fromAzure) {
        return new Promise((resolve, reject) => {
            csvtojson()
                .fromString(pathName.toString('utf8'))
                .then((jsonArray) => {
                    resolve(jsonArray);
                })
                .catch((err) => {
                    reject(err);
                });
        });
    } else {
        return csvtojson().fromFile(path.join(baseDir, pathName));
    }
};

module.exports = {
    csvToJson
}