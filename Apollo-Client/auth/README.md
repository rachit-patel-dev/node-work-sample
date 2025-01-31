# BasicAuth Namespace

The code snippet introduces a namespace called `BasicAuth` that encapsulates various functions related to user authentication and authorization. These functions cover tasks such as generating and verifying authentication tokens, handling password resets, updating passwords, logging in users, registering new users, and social network login.

## Functions

### 1. `generateAuthToken`
- **Purpose:** Generates an authentication token for a user based on their information and a JWT secret key.
- **Inputs:** User information and JWT secret key.
- **Outputs:** Authentication token.

### 2. `getCurrentUser`
- **Purpose:** Verifies and decodes an authentication token to retrieve the user's information.
- **Inputs:** Authentication token and JWT secret key.
- **Outputs:** User information.

### 3. `initPasswordReset`
- **Purpose:** Generates a reset token and stores it in Redis for a specified user.
- **Inputs:** User information.
- **Outputs:** Reset token.

### 4. `resetPassword`
- **Purpose:** Resets a user's password based on a reset token and updates the user's information.
- **Inputs:** Reset token and new password.
- **Outputs:** Updated user information.

### 5. `updatePassword`
- **Purpose:** Updates a user's password based on their current password and a new password.
- **Inputs:** Current password and new password.
- **Outputs:** Updated user information.

### 6. `login`
- **Purpose:** Handles the login process for a user, including password verification and generating an authentication token.
- **Inputs:** User credentials and JWT secret key.
- **Outputs:** Authentication token and user information.

### 7. `register`
- **Purpose:** Handles the registration process for a new user, including creating a new user and assigning a role.
- **Inputs:** User registration data and JWT secret key.
- **Outputs:** Registered user information.

### 8. `socialNetworkLogin`
- **Purpose:** Handles the login process using social network authentication, including creating a new user if necessary and generating an authentication token.
- **Inputs:** Social authentication details and JWT secret key.
- **Outputs:** Authentication token and user information.

## Usage Example

```javascript
import BasicAuth from './BasicAuth';

const jwtSecret = 'mySecretKey';

// Register a new user
const registrationData = {
  email: 'test@example.com',
  password: 'password123',
  firstName: 'John',
  lastName: 'Doe',
  role: 'user',
  jwtSecret: jwtSecret
};
const registeredUser = await BasicAuth.register.exec(client, registrationData, ctx);
console.log(registeredUser);

// Login a user
const loginData = {
  email: 'test@example.com',
  password: 'password123',
  jwtSecret: jwtSecret
};
const loggedInUser = await BasicAuth.login.exec(client, loginData, ctx);
console.log(loggedInUser);

// Generate an authentication token
const user = { id: '123', email: 'test@example.com', jwtVersion: 1 };
const authToken = await BasicAuth.generateAuthToken.exec(client, { user, jwtSecret });
console.log(authToken);

// Verify an authentication token
const token = '...'; // Replace with an actual token
const verifiedPayload = BasicAuth.getCurrentUser.exec(client, { token, jwtSecret });
console.log(verifiedPayload);


# JSON Web Token (JWT) Module

The provided TypeScript module offers functions for signing and verifying JSON Web Tokens (JWTs) using various algorithms, including HS256, RS256, and ES256. It also includes helper functions for generating HMAC signatures, RSA signatures, and ECDSA signatures, as well as functions for decoding and encoding JWTs.

## Functions

### 1. `sign(payload: object, secretKey: string, options?: SignOptions): string`
- **Purpose:** Signs a payload and returns a JWT.
- **Inputs:**
  - `payload`: The payload object to be signed.
  - `secretKey`: The secret key used for signing.
  - `options` (optional): Additional options including claims, algorithm, and headers.
- **Outputs:** Signed JWT as a string.

### 2. `verify(token: string, secretKey: string, options?: VerifyOptions): object`
- **Purpose:** Verifies a JWT and returns the payload if it's valid.
- **Inputs:**
  - `token`: The JWT to verify.
  - `secretKey`: The secret key used for verification.
  - `options` (optional): Additional options including claims and algorithm.
- **Outputs:** Payload of the JWT if it's valid.

## Usage Example

```typescript
import { sign, verify, JWTAlgo } from './jwt';

const payload = { sub: 'user123', role: 'admin' };
const secretKey = 'mySecretKey';

// Sign the payload with the HS256 algorithm
const token = sign(payload, secretKey, { alg: JWTAlgo.HS256 });

// Verify the token and get the payload
const verifiedPayload = verify(token, secretKey);

console.log(verifiedPayload);
// Output: { sub: 'user123', role: 'admin' }
```


# Apple Sign In OAuth Functions

The provided module includes functions for interacting with Apple Sign In OAuth, covering the generation of an OAuth URL, user authorization, and retrieving user information from the obtained ID token.

## Functions

### 1. `createOauthUrl(redirectUri: string, state: string): string`
- **Purpose:** Generates an OAuth URL for Apple Sign In.
- **Inputs:**
  - `redirectUri`: The redirect URI used for the authorization request.
  - `state`: State information for the authorization request.
- **Outputs:** The generated OAuth URL as a string.

### 2. `authorize(code: string, redirectUri: string): Promise<string>`
- **Purpose:** Authorizes a user with Apple Sign In and retrieves the ID token.
- **Inputs:**
  - `code`: The authorization code received from Apple Sign In.
  - `redirectUri`: The redirect URI used for the authorization request.
- **Outputs:** The ID token of the authorized user as a string.

### 3. `getUser(idToken: string): Promise<SocialAuthUser>`
- **Purpose:** Retrieves user information from Apple Sign In using the provided ID token.
- **Inputs:**
  - `idToken`: The ID token obtained from Apple Sign In.
- **Outputs:** A `SocialAuthUser` object containing the user information.

## Usage Example

```javascript
import { createOauthUrl, authorize, getUser } from './socialOauth';

const redirectUri = 'https://example.com/callback';
const state = 'abc123';

// Generate OAuth URL
const oauthUrl = createOauthUrl(redirectUri, state);
console.log(oauthUrl);
// Output: The generated OAuth URL for Apple Sign In.

// Authorize user and get ID token
const code = 'xyz789';
const idToken = await authorize(code, redirectUri);
console.log(idToken);
// Output: The ID token of the authorized user.

// Retrieve user information using ID token
const user = await getUser(idToken);
console.log(user);
// Output: A `SocialAuthUser` object containing the user information.
```

# Two-Factor Authentication (2FA) Module

The provided module handles various aspects of Two-Factor Authentication (2FA) functionality, including setup, removal, password reset, and login verification.

## Functions

### 1. `init.exec(client: any, args: { userId: string, password: string }, ctx: any): Promise<{ qr: string, secret: string }>`
- **Purpose:** Initializes 2FA setup for a user.
- **Inputs:**
  - `userId`: The user ID for whom 2FA setup is initiated.
  - `password`: The user's password for verification.
- **Outputs:** An object containing the QR code and secret for the user to complete 2FA setup.

### 2. `setup.exec(client: any, args: { userId: string, password: string, tfaCode: string }, ctx: any): Promise<string[]>`
- **Purpose:** Sets up 2FA for a user.
- **Inputs:**
  - `userId`: The user ID for whom 2FA is set up.
  - `password`: The user's password for verification.
  - `tfaCode`: The 2FA code for verification.
- **Outputs:** An array of recovery codes generated for the user.

### 3. `remove.exec(client: any, args: { userId: string, password: string, tfaCode: string }): Promise<User>`
- **Purpose:** Removes 2FA for a user.
- **Inputs:**
  - `userId`: The user ID for whom 2FA is removed.
  - `password`: The user's password for verification.
  - `tfaCode`: The 2FA code or recovery code for verification.
- **Outputs:** The updated user object without 2FA.

### 4. `resetPassword.exec(client: any, args: { token: string, jwtSecret: string, oldPassword: string, tfaCode: string }, ctx: any): Promise<User>`
- **Purpose:** Resets a user's password with 2FA verification.
- **Inputs:**
  - `token`: The reset token.
  - `jwtSecret`: The JWT secret for generating a new authentication token.
  - `oldPassword`: The user's old password for verification.
  - `tfaCode`: The 2FA code for verification.
- **Outputs:** The updated user object with a new password and authentication token.

### 5. `login.exec(client: any, args: { token: string, jwtSecret: string, tfaCode: string }, ctx: any): Promise<User>`
- **Purpose:** Handles the login process with 2FA verification.
- **Inputs:**
  - `token`: The login token.
  - `jwtSecret`: The JWT secret for generating an authentication token.
  - `tfaCode`: The 2FA code for verification.
- **Outputs:** The user object with an authentication token.

## Usage Example

```javascript
import TfaAuth from './TfaAuth';

// Initialize 2FA setup
const initArgs = {
  userId: '123',
  password: 'password123'
};
const setupData = await TfaAuth.init.exec(client, initArgs, ctx);
console.log(setupData.qr); // Display QR code for user to scan
console.log(setupData.secret); // Store secret for future verification

// Set up 2FA
const setupArgs = {
  userId: '123',
  password: 'password123',
  tfaCode: '123456'
};
const recoveryCodes = await TfaAuth.setup.exec(client, setupArgs, ctx);
console.log(recoveryCodes); // Store recovery codes for future use

// Remove 2FA
const removeArgs = {
  userId: '123',
  password: 'password123',
  tfaCode: '123456'
};
const user = await TfaAuth.remove.exec(client, removeArgs, ctx);
console.log(user); // Updated user object without 2FA

// Reset password with 2FA verification
const resetArgs = {
  token: 'resetToken',
  jwtSecret: 'jwtSecret',
  oldPassword: 'oldPassword',
  tfaCode: '123456'
};
const userWithToken = await TfaAuth.resetPassword.exec(client, resetArgs, ctx);
console.log(userWithToken); // Updated user object with new password and authentication token

// Login with 2FA verification
const loginArgs = {
  token: 'loginToken',
  jwtSecret: 'jwtSecret',
  tfaCode: '123456'
};
const userWithToken = await TfaAuth.login.exec(client, loginArgs, ctx);
console.log(userWithToken); // User object with authentication token
```

# Facebook OAuth Functions

The provided module includes functions for handling Facebook OAuth, allowing users to create OAuth URLs, authorize access, and retrieve user information.

## Functions

### 1. `createOauthUrl(redirectUri: string, state: string): string`
- **Purpose:** Constructs the OAuth URL for Facebook authorization.
- **Inputs:**
  - `redirectUri`: The redirect URI where Facebook will redirect after authorization.
  - `state`: The state to return with the token.
- **Outputs:** Returns the constructed OAuth URL as a string.

### 2. `authorize(code: string, redirectUri: string): Promise<string>`
- **Purpose:** Authorizes access by exchanging the authorization code for an access token.
- **Inputs:**
  - `code`: The authorization code obtained from the OAuth process.
  - `redirectUri`: The redirect URI used during the authorization request.
- **Outputs:** Returns the access token as a string.

### 3. `getUser(accessToken: string): Promise<SocialAuthUser>`
- **Purpose:** Retrieves user profile information from Facebook.
- **Inputs:**
  - `accessToken`: The access token obtained after authorization.
- **Outputs:** Returns the user's profile information as a `SocialAuthUser` object.

## Usage Example

```javascript
import { createOauthUrl, authorize, getUser } from './socialOauth';

const redirectUri = 'https://example.com/auth/callback';
const state = 'abc123';

// Create Facebook OAuth URL
const oauthUrl = createOauthUrl(redirectUri, state);
console.log(oauthUrl);
// Output: "https://www.facebook.com/v3.2/dialog/oauth?client_id=YOUR_APP_ID&redirect_uri=https%3A%2F%2Fexample.com%2Fauth%2Fcallback&scope=email%2Cpublic_profile&response_type=code&state=abc123"

// Authorize and get access token
const code = 'abcdef123456';
const accessToken = await authorize(code, redirectUri);
console.log(accessToken);
// Output: "EAA...ZDZD"

// Get user profile information
const user = await getUser(accessToken);
console.log(user);
// Output: { id: '123456789', email: 'example@example.com', firstName: 'John', lastName: 'Doe', avatar: 'https://example.com/avatar.jpg' }
```

# LinkedIn OAuth Functions

The provided TypeScript module offers functions for authenticating and retrieving user information from LinkedIn through the LinkedIn API. Below are the key functions and their usage.

## Functions

### 1. `createOauthUrl(redirectUri: string, state: TState): string`
- **Purpose:** Constructs the LinkedIn OAuth URL for user authorization.
- **Inputs:**
  - `redirectUri`: The URL to redirect to after user authorization.
  - `state`: The state to return with the authorization code.
- **Outputs:** Returns a string representing the LinkedIn OAuth URL.

### 2. `authorize(code: string, redirectUri: string): Promise<string>`
- **Purpose:** Exchanges an authorization code for an access token from LinkedIn.
- **Inputs:**
  - `code`: The authorization code obtained from the OAuth process.
  - `redirectUri`: The redirect URI used during the authorization request.
- **Outputs:** Returns a string representing the obtained access token.

### 3. `getUser(accessToken: string): Promise<SocialAuthUser>`
- **Purpose:** Retrieves the user's profile and email from LinkedIn using the provided access token.
- **Inputs:**
  - `accessToken`: The access token obtained after authorization.
- **Outputs:** Returns a `SocialAuthUser` object containing the user's profile and email information.

## Usage Example

```typescript
import { createOauthUrl, authorize, getUser } from './socialOauth';

const redirectUri = 'https://example.com/callback';
const state = 'random-state';

// Create LinkedIn OAuth URL
const oauthUrl = createOauthUrl(redirectUri, state);
// Output: 'https://www.linkedin.com/oauth/v2/authorization?client_id=linkedinAppId&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&scope=r_liteprofile%20r_emailaddress&response_type=code&state=random-state'

// Authorize and get access token
const code = 'authorization-code';
const accessToken = await authorize(code, redirectUri);
// Output: 'access-token'

// Get user profile and email
const user = await getUser(accessToken);
// Output: { id: 'user-id', email: 'user@example.com', firstName: 'John', lastName: 'Doe', avatar: 'avatar-url', avatarMime: 'image/jpeg' }
```


# Google OAuth2 Functions

The provided TypeScript module offers functions for implementing Google OAuth2 authentication. Below are the key functions and their usage.

## Functions

### 1. `createOauthUrl(redirectUri: string, state: string): string`
- **Purpose:** Generates the Google OAuth URL for user authorization.
- **Inputs:**
  - `redirectUri`: The URL to redirect to after user authorization.
  - `state`: A state value for additional security.
- **Outputs:** Returns a string representing the Google OAuth URL.

### 2. `authorize(code: string, redirectUri: string): Promise<string>`
- **Purpose:** Exchanges an authorization code for an access token from Google.
- **Inputs:**
  - `code`: The authorization code obtained from the OAuth flow.
  - `redirectUri`: The redirect URI used during the authorization request.
- **Outputs:** Returns the obtained access token as a string.

### 3. `getUser(accessToken: string): Promise<SocialAuthUser>`
- **Purpose:** Retrieves user information from Google using the provided access token.
- **Inputs:**
  - `accessToken`: The access token obtained after authorization.
- **Outputs:** Returns a `SocialAuthUser` object containing user information.

## Usage Example

```typescript
import { createOauthUrl, authorize, getUser } from './googleOAuth';

const redirectUri = 'https://example.com/oauth/callback';
const state = 'random-state-value';

// Step 1: Create Google OAuth URL
const oauthUrl = createOauthUrl(redirectUri, state);
console.log(oauthUrl);
// Output: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=...'

// Step 2: Exchange authorization code for access token
const code = 'authorization-code';
const accessToken = await authorize(code, redirectUri);
console.log(accessToken);
// Output: 'access-token-value'

// Step 3: Retrieve user information
const user = await getUser(accessToken);
console.log(user);
// Output: { id: '...', email: '...', firstName: '...', lastName: '...', avatar: '...' }
```


# TOTP Secret Key Generation

The provided TypeScript module snippet includes two functions: `generateSecret` and `generateRecoveryCodes`. Below is the documentation for the `generateSecret` function.

## Function: `generateSecret`

### Inputs
The `generateSecret` function does not have any explicit inputs.

### Flow
1. The function generates a random secret key using the `randomBytes` function from the crypto module.
2. The generated secret key is converted to a base64 string.
3. The base64 string is truncated to the desired length.
4. The truncated secret key is encoded using a custom base32 encoding function called `encode`.
5. Any trailing equal signs in the encoded secret key are removed using a regular expression.
6. The encoded and trimmed secret key is returned as the output of the function.

### Outputs
- Returns a string representing the generated secret key.

## Usage Example
```typescript
import { generateSecret } from './yourModule';

const secretKey = generateSecret();
console.log(secretKey);
// Output: "JBSWY3DPEHPK3PXP"
