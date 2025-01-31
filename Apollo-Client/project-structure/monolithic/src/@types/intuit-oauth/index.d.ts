declare module 'intuit-oauth' {
  export type TEnvironment = 'sandbox' | 'production';

  export interface IConfig {
    environment: TEnvironment;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    token?: ITokens;
    logging?: boolean;
  }

  export interface ITokens {
    token_type: 'bearer';
    access_token: string;
    expires_in: number;
    refresh_token: string;
    x_refresh_token_expires_in: number;
    createdAt?: number; // (Optional Default = Date.now()) <Milliseconds> from the unix epoc
    realmId?: string;
    id_token?: string;
    latency?: number;
  }

  export type TFaultError = {
    code: string;
    Message: string;
    Detail: string;
    element: string;
  };

  export type TFaultResponseObject = {
    type: string;
    Error: Array<TFaultError>;
  };

  export type TFaultResponse = {
    Fault: TFaultObject;
  };

  export type TQueryResponseObject<TValue, TKey extends string = string> = { [T in TKey]: Array<TValue> } & {
    startPosition: number;
    maxResults: number;
    totalCount?: number;
  };

  export type TQueryResponse<TValue, TKey = string> = {
    QueryResponse: TQueryResponseObject<TValue, TKey>;
  };

  export interface IResponse<T> {
    token: ITokens;
    response: {
      url: string;
      headers: Record<string, unknown>;
      body: string;
      status: number;
      statusText: string;
    };
    intuit_tid: string;
    body: string;
    json: (T | TFaultResponse) & {
      time: string;
    };

    text(): string; // return body
    status(): number; // return status
    headers(): Record<string, unknown>; // return headers
    valid(): boolean; // check response status in range [200, 300)
    getJson(): T & { time: string }; // get json from body
    get_intuit_tid(): string; // return intuit_tid
    isContentType(contentType: string): boolean; // check response content type
    getContentType(): string; // return response content type
    isJson(): boolean; // check response content type is json
  }

  export type TAuthorizeUriParams = {
    state?: string;
    scope?: string | string[];
  };

  export type TMakeApiCallParams = {
    url: string;
    method: string;
    headers?: Record<string, unknown>;
    body?: Record<string, any>;
  };

  export type TValidateIdTokenParams = {
    id_token?: string;
  };

  /**
 * Represents the prototype for the OAuthClient class.
 */
  export class OAuthClientPrototype {
    log(level: 'info' | 'error', message: string, data: string);
  }

  /**
 * Represents an OAuth client for making API calls to Intuit QuickBooks.
 */
  export class OAuthClient extends OAuthClientPrototype {
    public static readonly scopes = {
      Accounting: 'com.intuit.quickbooks.accounting',
      Payment: 'com.intuit.quickbooks.payment',
      Payroll: 'com.intuit.quickbooks.payroll',
      TimeTracking: 'com.intuit.quickbooks.payroll.timetracking',
      Benefits: 'com.intuit.quickbooks.payroll.benefits',
      Profile: 'profile',
      Email: 'email',
      Phone: 'phone',
      Address: 'address',
      OpenId: 'openid',
      Intuit_name: 'intuit_name'
    };
    public static readonly environment = {
      sandbox: 'https://sandbox-quickbooks.api.intuit.com/',
      production: 'https://quickbooks.api.intuit.com/'
    };

    constructor(private config: IConfig) {}

    authorizeUri(params: TAuthorizeUriParams): string;

    refresh(): Promise<IResponse<ITokens>>;
    refreshUsingToken(token: string): Promise<IResponse<ITokens>>;

    createToken(uri: string): Promise<IResponse<ITokens>>;
    getToken(): ITokens;
    setToken(params: ITokens): ITokens;

    validateIdToken(params: TValidateIdTokenParams): Promise<boolean>;
    validateToken(): void;
    isAccessTokenValid(): boolean;

    makeApiCall<TValue = any, TKey = string>(params: TMakeApiCallParams): Promise<IResponse<TValue, TKey>>;
  }

  export default OAuthClient;
}
