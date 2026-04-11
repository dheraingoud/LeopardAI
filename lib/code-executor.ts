export interface ExecutionResult {
  status: 'success' | 'error' | 'timeout';
  output: string;
  error?: string;
  duration: number;
}

export async function executeCode(code: string): Promise<ExecutionResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    // 5 second timeout
    const timeout = setTimeout(() => {
      resolve({
        status: 'timeout',
        output: '',
        error: 'Execution timed out (5s limit)',
        duration: Date.now() - startTime,
      });
    }, 5000);

    try {
      // Capture console.log output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
      };

      // Execute code
      // Try to return the result, or just capture logs
      let result: unknown;
      try {
        // Wrap in parentheses to handle expressions
        result = new Function('return (' + code + ')')();
      } catch {
        // If that fails, try as statements
        result = new Function(code)();
      }

      // Restore console.log
      console.log = originalLog;
      clearTimeout(timeout);

      // Build output
      const output = logs.length > 0 ? logs.join('\n') : (result !== undefined ? String(result) : 'undefined');

      resolve({
        status: 'success',
        output,
        duration: Date.now() - startTime,
      });
    } catch (err) {
      clearTimeout(timeout);
      resolve({
        status: 'error',
        output: '',
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - startTime,
      });
    }
  });
}
