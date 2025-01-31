# Event Emitter in NestJS

The Event Emitter in NestJS provides a mechanism for communication between different parts of your application by allowing components to emit and listen for events. This is particularly useful for handling asynchronous processes, decoupling components, and improving the scalability of your application.

## Key Concepts

### Event
- An event represents a specific occurrence or action within your application. In the provided example, `OrderCreatedEvent` is an event class with properties like `name` and `description`.

### Listener
- A listener is a component that "listens" for specific events and executes a designated function (handler) when the event occurs. In the example, `OrderCreatedListener` is a listener for the `order.created` event.

### Event Emitter
- The event emitter is a service responsible for emitting events and notifying registered listeners. In NestJS, the `@nestjs/event-emitter` module provides decorators like `@OnEvent` to define listeners.

## How it Works

1. **Event Declaration:**
   - Events are typically declared as classes with properties representing data associated with the event. In the example, `OrderCreatedEvent` is defined with `name` and `description` properties.

2. **Listener Registration:**
   - Listeners are components that register to listen for specific events. In the example, the `OrderCreatedListener` is annotated with `@OnEvent('order.created')`, indicating that it listens for the `order.created` event.

3. **Handling Events:**
   - When an event is emitted (e.g., `eventEmitter.emit('order.created', eventData)`), all registered listeners for that event are triggered. The corresponding handler function in each listener is executed.

4. **Decoupling Components:**
   - Event emitters and listeners help in decoupling components, allowing different parts of the application to communicate without direct dependencies. This enhances modularity and maintainability.

5. **Scalability:**
   - By using events, you can scale your application more effectively. For instance, multiple listeners can respond to the same event, enabling parallel processing and improving overall application responsiveness.

## NestJS Integration

In NestJS, the `@nestjs/event-emitter` module provides decorators and services for easily implementing the event emitter pattern. By using decorators like `@OnEvent` on listener methods, you can specify which events a component should respond to.

This event-driven approach enhances the flexibility and maintainability of your NestJS applications by promoting loose coupling between components. It is particularly useful for scenarios where different parts of the application need to react to specific events asynchronously.