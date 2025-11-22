export function add(a: number, b: number): number {
  return a + b;
}

export function calculate(a: number, b: number): void {
  const result = add(a, b);
  console.log(`The result is ${result}`);
}