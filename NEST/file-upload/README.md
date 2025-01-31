# File Upload

A simple example of file upload

## Execution

```sh
npm run start # OR npm run start:dev
# in another terminal
curl http://localhost:3000/file -F 'file=@./package.json' -F 'name=test'
```

# File Uploading in NestJS

File uploading in NestJS involves handling and processing files submitted by clients. The provided `AppController` demonstrates file uploading using the `@nestjs/platform-express` module and the `FileInterceptor`. Below is an explanation of the code without including specific code snippets:

## Controller Configuration

- **Imports:**
  - Import necessary decorators from `@nestjs/common` and `@nestjs/platform-express` for handling HTTP requests and file uploading.

- **Constructor:**
  - The controller is initialized with an instance of `AppService`.

## File Uploading Endpoint

- **`uploadFile` Method:**
  - Decorated with `@Post('file')` to handle POST requests at the endpoint '/file'.
  - Uses the `FileInterceptor` to intercept file uploads with the field name 'file'.
  - The `@Body` decorator is used to extract additional data sent in the request body (e.g., `SampleDto`).
  - The `@UploadedFile` decorator retrieves the uploaded file for further processing.

- **`uploadFileAndPassValidation` Method:**
  - Similar to `uploadFile` but includes file validation.
  - Uses the `ParseFilePipeBuilder` to build a custom pipe for parsing and validating the uploaded file.
  - Validation rules are applied, such as checking the file type (e.g., 'json').
  - The `fileIsRequired` option is set to `false` to handle cases where the file is optional.

- **`uploadFileAndFailValidation` Method:**
  - Similar to `uploadFileAndPassValidation` but intentionally configured to fail validation.
  - Demonstrates handling scenarios where the file type validation fails, leading to an error response.

## Usage of Interceptors

- **`@UseInterceptors`:**
  - Applied on each endpoint to utilize the `FileInterceptor` for handling file uploads.
  - Interceptors are middleware functions that can modify the request or response objects.

## Parsing and Validation

- **Custom Parsing:**
  - The uploaded file is accessed using the `@UploadedFile` decorator.
  - The file buffer is converted to a string for further processing.

- **Validation:**
  - Validation is demonstrated using the `ParseFilePipeBuilder`.
  - Validation rules, such as checking file types, can be added to ensure the uploaded file meets specific criteria.

## Conclusion

File uploading in NestJS involves combining decorators, interceptors, and pipes to handle and validate uploaded files. The `FileInterceptor` simplifies the process, and custom validation can be implemented using pipes for more specific use cases.