// SQLは実D1で実行する。query builderの呼出しでなくbindingの実行往復を計測する。
export function measuredDatabase(binding: D1Database) {
  const source = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const stats = { roundtrips: 0, statements: 0 };
  const timing = { bindingMs: 0 };
  async function measure<T>(operation: () => Promise<T>) {
    const started = performance.now();
    try {
      return await operation();
    } finally {
      timing.bindingMs += performance.now() - started;
    }
  }
  const statement = (original: D1PreparedStatement): D1PreparedStatement => {
    const wrapped = new Proxy(original, {
      get(target, key) {
        if (key === "bind") return (...args: unknown[]) => statement(target.bind(...args));
        const value: unknown = Reflect.get(target, key);
        if (typeof value !== "function") return value;
        return (...args: unknown[]): unknown => {
          if (["run", "all", "raw", "first"].includes(String(key))) {
            stats.roundtrips++;
            stats.statements++;
            return measure(async (): Promise<unknown> => Reflect.apply(value, target, args));
          }
          return Reflect.apply(value, target, args);
        };
      },
    });
    source.set(wrapped, original);
    return wrapped;
  };
  const database = new Proxy(binding, {
    get(target, key) {
      if (key === "prepare") return (sql: string) => statement(target.prepare(sql));
      if (key === "batch")
        return (items: D1PreparedStatement[]) => {
          stats.roundtrips++;
          stats.statements += items.length;
          return measure(() => target.batch(items.map((item) => source.get(item) ?? item)));
        };
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function"
        ? (...args: unknown[]): unknown => Reflect.apply(value, target, args)
        : value;
    },
  });
  return { database, stats, timing };
}
