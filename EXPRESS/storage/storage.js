require('dotenv').config();
const multer = require('multer');
const fs = require('fs');
/**
 * The Storage function determines the storage configuration for multer based on the value of the ENABLE_AZURE_BLOB environment variable.
 * 
 * @param {string} path - The path where the uploaded files will be stored.
 * @returns {object} - The storage configuration object for multer.
 */
const Storage = (path) => {
    if (!JSON.parse(process.env.ENABLE_AZURE_BLOB)) {
        return multer.diskStorage({
            destination: (req, file, cb) => {
                if (!fs.existsSync(path)) {
                    // Create the folder if it doesn't exist
                    fs.mkdirSync(path, { recursive: true });
                }
                cb(null, path);
            },
            filename: (req, file, cb) => {
                cb(null, `${file.originalname.split('.')[0]}-${new Date().getTime()}.${file.originalname.split('.').slice(-1)}`);
            }
        });
    } else {
        return multer.memoryStorage({
            filename: (req, file, cb) => {
                cb(null, `${file.originalname.split('.')[0]}-${new Date().getTime()}.${file.originalname.split('.').slice(-1)}`);
            }
        });
    }
}
/**
 * FileFilter function filters the files based on the provided file mimetypes.
 * 
 * @param {Array} file_mimetypes - An array of file mimetypes to filter the files.
 * @returns {Function} - A filter function that checks if the file mimetype matches any of the provided mimetypes.
 */
const FileFilter = (file_mimetypes) => {
    const filter = (req, file, cb) => {
        let check = false;
        file_mimetypes.forEach(element => {
            if (file.mimetype === element) {
                check = true;
            }
        });
        if (check) {
            // will accept file
            cb(null, true);
        } else {
            // will reject file
            cb(null, false);
        }
    };
    return filter;
}
exports.uploader = (path) => multer({
    storage: Storage(path), fileFilter: FileFilter(['text/csv'])
})