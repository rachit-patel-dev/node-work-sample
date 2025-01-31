# Paginator Function

The provided code defines a `paginator` function that calculates pagination metadata based on the given parameters. Below is the Markdown explanation for the function:

## `paginator(req, totalCount, limit, count, pageNumber, isSearchable = false)`

Calculates pagination metadata for a given set of parameters.

- **Parameters:**
  - `req` (Object): The request object.
  - `totalCount` (number): The total count of items.
  - `limit` (number): The maximum number of items per page.
  - `count` (number): The actual number of items on the current page.
  - `pageNumber` (number): The current page number.
  - `isSearchable` (boolean, optional, default: false): Indicates if the pagination is for a searchable result.

- **Returns:**
  - An object representing pagination metadata with the following properties:
    - `Pages` (number): The total number of pages.
    - `PageSize` (number): The number of items on the current page.
    - `PageNumber` (number): The current page number.
    - `TotalCount` (number): The total count of items.
    - `Next` (string): The URL for the next page. If null, no next page.
    - `Previous` (string): The URL for the previous page. If null, no previous page.

- **Example:**
  ```javascript
  const req = { protocol: 'https', get: () => 'localhost', baseUrl: '/example' };
  const totalCount = 100;
  const limit = 10;
  const count = 10;
  const pageNumber = 1;
  const paginationMeta = paginator(req, totalCount, limit, count, pageNumber, false);
  console.log(paginationMeta);
  ```

  Output:
  ```json
  {
    "Pages": 10,
    "PageSize": 10,
    "PageNumber": 1,
    "TotalCount": 100,
    "Next": "https://localhost/example?PageSize=10&PageNumber=2",
    "Previous": null
  }
  ```

## Module Export

The module exports an object with the `paginator` function.

```javascript
module.exports = {
    paginator
}
```

This allows the `paginator` function to be used in other parts of the application by importing the module.