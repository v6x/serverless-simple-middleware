import * as awsTypes from 'aws-lambda';
export interface RequestAuxBase {
    [pluginName: string]: any;
}
export declare class HandlerRequest {
    event: awsTypes.APIGatewayEvent;
    context: awsTypes.APIGatewayEventRequestContext;
    lastError: Error | string | undefined;
    private lazyBody?;
    constructor(event: any, context: any);
    get body(): any;
    get path(): {
        [key: string]: string | undefined;
    };
    get query(): {
        [key: string]: string | undefined;
    };
    header(key: string): string | undefined;
    records<T, U>(selector?: (each: T) => U): T[] | U[];
}
export declare class HandlerResponse {
    callback: any;
    completed: boolean;
    result: any | Promise<any> | undefined;
    private cookies;
    private crossOrigin?;
    private customHeaders;
    constructor(callback: any);
    ok(body?: {}, code?: number): any;
    fail(body?: {}, code?: number): any;
    addCookie(key: string, value: string, domain?: string, specifyCrossOrigin?: true, path?: string): void;
    setCrossOrigin: (origin?: string) => void;
    addHeader: (header: string, value: string) => void;
}
export interface HandlerAuxBase {
    [key: string]: any;
}
export interface HandlerContext<A extends HandlerAuxBase> {
    request: HandlerRequest;
    response: HandlerResponse;
    aux: A;
}
export type Handler<A extends HandlerAuxBase> = (context: HandlerContext<A>) => any | Promise<any> | undefined;
export interface HandlerPlugin<A extends HandlerAuxBase> {
    create: () => Promise<A> | A;
    begin: Handler<A>;
    end: Handler<A>;
    error: Handler<A>;
}
export declare class HandlerPluginBase<A extends HandlerAuxBase> implements HandlerPlugin<A> {
    create: () => Promise<A> | A;
    begin: (_: HandlerContext<A>) => void;
    end: (_: HandlerContext<A>) => void;
    error: (_: HandlerContext<A>) => void;
}
