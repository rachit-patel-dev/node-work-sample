# gRPC with NestJS Explanation

## Proto File (`hero.proto`)

The `hero.proto` file defines a gRPC service for handling heroes. It includes two RPC methods: `FindOne` and `FindMany`. The messages `HeroById` and `Hero` are used to communicate between the client and server.

```proto
syntax = "proto3";

package hero;

service HeroesService {
  rpc FindOne (HeroById) returns (Hero);
  rpc FindMany (stream HeroById) returns (stream Hero);
}

message HeroById {
  int32 id = 1;
}

message Hero {
  int32 id = 1;
  string name = 2;
}
```

## NestJS Module (`HeroModule`)

The `HeroModule` is a NestJS module that integrates with gRPC. It uses the `ClientsModule` to register a gRPC client named 'HERO_PACKAGE' with the specified `grpcClientOptions`.

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'HERO_PACKAGE',
        ...grpcClientOptions,
      },
    ]),
  ],
  controllers: [HeroController],
})
export class HeroModule {}
```

## NestJS Controller (`HeroController`)

The `HeroController` is a NestJS controller that handles HTTP requests and gRPC methods related to heroes.

- **Initialization**: The `onModuleInit` method sets up the `heroesService` using the gRPC client.

- **HTTP Endpoints**:
  - `getMany()`: Retrieves multiple heroes using a gRPC stream.
  - `getById(id: string)`: Retrieves a hero by ID using a gRPC method.

- **gRPC Methods**:
  - `findOne(data: HeroById): Hero`: Implements the `FindOne` gRPC method.
  - `findMany(data$: Observable<HeroById>): Observable<Hero>`: Implements the `FindMany` gRPC method using a stream.

```typescript
@Controller('hero')
export class HeroController implements OnModuleInit {
  // ... constructor and methods ...
}
```

## gRPC Client Options (`grpcClientOptions`)

The `grpcClientOptions` object specifies the configuration for the gRPC client. It includes the transport type (gRPC), the package name, and the path to the `hero.proto` file.

```typescript
export const grpcClientOptions: ClientOptions = {
  transport: Transport.GRPC,
  options: {
    package: 'hero',
    protoPath: join(__dirname, './hero/hero.proto'),
  },
};
```

## Bootstrap File (`main.ts`)

The `main.ts` file is the entry point of the NestJS application. It creates a NestJS application and connects it to the gRPC microservice using the specified `grpcClientOptions`.

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>(grpcClientOptions);

  await app.startAllMicroservices();
  await app.listen(3001);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
```

## Conclusion

This NestJS application demonstrates the integration of gRPC for handling heroes. It includes a gRPC service defined in `hero.proto`, a NestJS module (`HeroModule`), a controller (`HeroController`) for handling HTTP requests and gRPC methods, and configuration options for the gRPC client. The application connects to the gRPC microservice during startup and listens for HTTP requests on port 3001.