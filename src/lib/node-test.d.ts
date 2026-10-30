declare module 'node:test' {
  function test(name: string, fn: () => void | Promise<void>): Promise<void>;
  export default test;
}

declare module 'node:assert/strict' {
  const assert: {
    equal<T>(actual: T, expected: T, message?: string): void;
    notEqual<T>(actual: T, expected: T, message?: string): void;
    deepEqual<T>(actual: T, expected: T, message?: string): void;
    match(value: string, regExp: RegExp, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    throws(block: () => unknown, error?: RegExp | Error, message?: string): void;
    rejects(block: (() => Promise<unknown>) | Promise<unknown>, error?: RegExp | Error, message?: string): Promise<void>;
  };
  export default assert;
}
