export class OncePromise<T> {
  private promise?: Promise<T>;
  private factory?: () => Promise<T>;

  constructor(factory?: () => Promise<T>) {
    this.factory = factory;
  }

  public async run(factory?: () => Promise<T>): Promise<T> {
    if (!this.promise) {
      const f = factory || this.factory;
      if (!f) {
        throw new Error('OncePromise requires a factory');
      }
      this.promise = f();
      try {
        return await this.promise;
      } finally {
        this.promise = undefined;
      }
    }
    return this.promise;
  }
}
