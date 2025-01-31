# File Uploader Module

## Storage Function
The `Storage` function is defined to configure multer middleware for file uploading based on the destination path.

- If `ENABLE_AZURE_BLOB` is not set to true, the function returns a disk storage configuration for multer.
  - The `destination` function is defined to create the destination folder if it doesn't exist and set it as the destination for the uploaded file.
  - The `filename` function is defined to rename the uploaded file with a timestamp.

- If `ENABLE_AZURE_BLOB` is set to true, the function returns a memory storage configuration for multer.
  - In the memory storage configuration, the `filename` function is defined to rename the uploaded file with a timestamp.

## FileFilter Function
The `FileFilter` function is defined, taking a `file_mimetypes` parameter.

- The `filter` function is defined within `FileFilter` to check if the mimetype of the uploaded file matches any of the allowed mimetypes.

## Uploader Function
The `uploader` function is defined, taking a `path` parameter.

- The function returns a multer middleware configuration object, utilizing the `Storage` and `FileFilter` functions.

## Usage Example
```javascript
const uploader = require('./uploader');

// Configure multer middleware for file uploading
const upload = uploader.uploader('/path/to/uploads');

// Use the configured middleware in an Express route
app.post('/upload', upload.single('file'), (req, res) => {
  // Handle the uploaded file
  res.send('File uploaded successfully');
});
```

This module provides a flexible and configurable file uploading middleware for an Express application, supporting both disk and memory storage options based on the `ENABLE_AZURE_BLOB` environment variable.