/**
 * Named service registry for inter-plugin APIs
 *
 * A plugin exposes a service in `setup()`:
 *     ctx.services.register("my_api", this);
 * A peer consumes it (safe after load-order resolution):
 *     const api = ctx.services.require("my_api"); // throws if absent
 *     const api = ctx.services.get("my_api");     // undefined if absent
 */
import { logger } from "../log.js";

export class ServiceRegistry {
  private services = new Map<string, unknown>();
  private owners = new Map<string, string>();

  register(name: string, impl: unknown, owner = ""): void {
    if (this.services.has(name)) {
      logger.warning(
        `ServiceRegistry: '${name}' re-registered (was '${this.owners.get(name)}', now '${owner}')`,
      );
    }
    this.services.set(name, impl);
    this.owners.set(name, owner);
    logger.debug(`ServiceRegistry: '${owner}' registered '${name}'`);
  }

  get<T = unknown>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  require<T = unknown>(name: string): T {
    const impl = this.services.get(name);
    if (impl == null) {
      throw new Error(
        `Required service '${name}' is not registered. ` +
          "Ensure the providing plugin is listed in 'dependencies'.",
      );
    }
    return impl as T;
  }

  unregister(name: string): void {
    this.services.delete(name);
    this.owners.delete(name);
  }
}
