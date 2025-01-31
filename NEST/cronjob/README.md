## Cronjob Service in NestJS

The `CronjobService` in NestJS provides functionality related to automatic group joining. It includes an `autoJoin` method that allows a user to join a group based on geographical coordinates.

### `autoJoin` Method

The `autoJoin` method is responsible for automatically joining a user to a local group. Here's a high-level overview of the process:

1. **Check User Existence:**
   - The service checks if the specified user exists. If not, it throws a `NOT_FOUND` HTTP exception.

2. **Find Nearby Local Groups:**
   - Utilizing MongoDB's `$geoNear` aggregation, the service retrieves nearby local groups based on the provided geographical coordinates.

3. **Check Group Availability:**
   - If no local groups are found, it throws a `NOT_FOUND` HTTP exception.

4. **Check Membership Status:**
   - It checks if the user is already a member of any of the found groups. If yes, it throws a `NOT_FOUND` HTTP exception.

5. **Join User to Groups:**
   - The user is joined to the found local groups by updating the group's `members` array.

6. **Handle Errors:**
   - Any encountered errors during the process result in a `BAD_REQUEST` HTTP exception.

### Cronjob Module

The `CronjobModule` encapsulates the `CronjobService` and specifies the Mongoose models for User and Community.

### Cronjob Controller

The `CronjobController` contains an endpoint for auto-joining groups. It delegates the request to the `autoJoin` method of the `CronjobService`.

## How to Use

To automatically join a user to nearby local groups:

1. Make a POST request to `/cronjob/autojoin`.
2. Include the required data, such as user ID and geographical coordinates, in the request body.

Remember to handle any exceptions that might occur during the auto-joining process.