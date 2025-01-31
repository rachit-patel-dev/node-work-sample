# Authentication Module with JWT in NestJS

## Overview

The authentication module in this NestJS application utilizes JSON Web Tokens (JWT) for secure user authentication. It consists of an `AuthController`, `AuthGuard`, and `AuthService`.

### AuthController

The `AuthController` handles authentication-related endpoints:

- **POST /auth/login**: 
  - A public endpoint decorated with `@Public()`.
  - Accepts a `username` and `password` in the request body.
  - Calls `AuthService.signIn` to validate credentials and generate an access token.

- **GET /auth/profile**:
  - Requires a valid JWT token in the Authorization header.
  - Retrieves and returns the user profile from the request object.

### AuthGuard

The `AuthGuard` is a NestJS Guard:

- Implements `CanActivate` to control access to routes.
- Checks for the `@Public()` decorator to allow public access.
- Extracts the JWT token from the Authorization header.
- Verifies the token using `JwtService` and attaches the user payload to the request.

### AuthService

The `AuthService` manages user authentication:

- Accepts a username and password from the `AuthController`.
- Validates credentials using `UsersService`.
- Generates a JWT token with user information upon successful authentication.

This module enables secure authentication using JWT, ensuring that protected routes are accessible only with a valid token. The `AuthGuard` plays a crucial role in validating tokens and making user information available in route handlers.