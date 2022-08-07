import { never, z } from "zod";

// OK
type WithoutPrefix<Value extends string, Prefix extends string> = Value extends `${Prefix}${infer Rest}` ? Rest : Value;
type WithoutSuffix<Value extends string, Suffix extends string> = Value extends `${infer Rest}${Suffix}` ? Rest : Value;

type SplitPath<T extends string> = T extends "" ? [] : WithoutPrefix<T, "/"> extends `${infer Part}/${infer Rest}` ? [Part, ...SplitPath<Rest>] : [T];

// WIP

type ParamType = "string" | "number";
type TParamType<T extends ParamType> = T extends "string" ? string : T extends "number" ? number : never;

type PathParam<T extends string> = T extends `:${string}.${infer Type}`
  ? Type extends ParamType
    ? TParamType<Type>
    : never
  : T extends `:${string}`
  ? string
  : never;
type NextPathParam<T extends string> = T extends `${string}:${infer Param}/${WithoutPrefix<string, "/">}` ? PathParam<Param> : never;

type ExtractParams<T extends string> = T extends ""
  ? []
  : WithoutPrefix<T, "/"> extends `:${infer Param}/${infer Rest}`
  ? [Param, ...ExtractParams<Rest>]
  : WithoutPrefix<T, "/"> extends `:${infer Param}`
  ? [Param]
  : WithoutPrefix<T, "/"> extends `${string}/${infer Rest}`
  ? ExtractParams<Rest>
  : [T];

type ExtractPath<T extends string> = {
  raw: T;
  base: SplitPath<T>[0];
  params: {
    [U in ExtractParams<T>[number]]: PathParam<U>;
    // [V in Exclude<SplitPath<T>[number], SplitPath<T>[0]>]: PathParam<V>;
  };
};

const value = "/users/:userId.number/post/:postId";
type TestPath = ExtractPath<typeof value>;
type TestPaths = SplitPath<typeof value>;
type TestParams = ExtractParams<typeof value>;

// http4t

export type Request<TPath extends string, TBody extends any> = {
  path: Omit<ExtractPath<TPath>, "params">;
  params: ExtractPath<TPath>["params"];
  body: TBody;
};
export type Response = {
  status: number;
  body?: any;
};

export type Handler<TPath extends string, TBody extends any> = (request: Request<TPath, TBody>) => Promise<Response> | Response;

export enum Method {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
}

export type Routes = {
  [Path in string]: Routes | Route<Path, any, any>[];
};
export interface Route<TPath extends string, TBody extends z.ZodRawShape, TBodySpec extends z.ZodSchema<TBody>> {
  path: TPath;
  method: Method;
  bodySpec: TBodySpec;
  handler: Handler<TPath, TBody>;
}

export class App {
  constructor(private routes: Route<string, z.ZodRawShape, z.ZodSchema>[]) {}

  async execute(path: string, method: Method, options?: { body: any }): Promise<Response> {
    const fixedPath = path.replace(/^\//, "").replace(/\/$/, "").split("/");

    let route: Route<string, any, any> | undefined = undefined;
    let params: any;
    let i = 0;
    mainLoop: while (!route && i < this.routes.length) {
      const currentRoute = this.routes[i];

      if (method === currentRoute.method) {
        const routePath = currentRoute.path.replace(/^\//, "").replace(/\/$/, "").split("/");

        if (routePath.length === fixedPath.length) {
          route = currentRoute;
          params = {};
          let j = 0;
          while (j < routePath.length) {
            if (routePath[j].startsWith(":")) {
              const key = routePath[j].replace(/^:/, "");
              params[key] = fixedPath[j];
            } else if (routePath[j] !== fixedPath[j]) {
              route = undefined;
              params = {};
              continue mainLoop;
            }
            j++;
          }
        }
      }

      i++;
    }

    if (route) {
      const body = route.bodySpec?.safeParse(options?.body);

      const request: Request<typeof path, typeof body> = {
        path: {
          raw: route.path,
          base: route.path.split("/").find((item) => !!item),
        },
        params,
        body: body,
      };
      return route.handler(request);
    }
    return { status: 404 };
  }
}

export class AppBuilder {
  private routes: Route<string, any, any>[] = [];

  constructor() {}

  with<TPath extends string, TBody extends any>(
    path: TPath,
    method: Method,
    options: { bodySpec?: z.ZodSchema<TBody>; handle: Handler<TPath, TBody> }
  ): AppBuilder {
    this.routes.push({ path, method, bodySpec: options.bodySpec, handler: options.handle });
    return this;
  }

  build(): typeof app {
    const app = new App(this.routes);
    return app;
  }
}

export const buildApp = <TRoutes extends Routes>(): typeof app => {
  const app = new AppBuilder();
  return app;
};

const main = async () => {
  const app = buildApp()
    .with("/users", Method.GET, {
      async handle(request) {
        return { status: 200, body: [] };
      },
    })
    .with("/users/:id/:test", Method.GET, {
      bodySpec: z
        .object({
          test: z.number(),
        })
        .optional(),
      async handle(request) {
        request.params[":id"];
        const body = request.body;
        if (body) {
        }
        return { status: 200, body: request.params };
      },
    })
    .build();

  const response = await app.execute("/users/10/aaa", Method.GET);
  console.log(JSON.stringify(response));
};
main();
