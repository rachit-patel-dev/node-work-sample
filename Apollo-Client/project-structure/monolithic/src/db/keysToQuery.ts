/**
 * Generates a query string and argument array based on the differences between two objects.
 * 
 * @param obj - The object containing the keys and values to compare against.
 * @param currentValues - The object containing the current values to compare with.
 * @param startIndex - The starting index for the argument array. Default is 1.
 * @returns An array containing the query string and argument array.
 */
export function keysToQuery<TObj extends { [key: string]: any }>(
  obj: TObj,
  currentValues: TObj,
  startIndex = 1
) {
  const args: any[] = [];
  let argIndex = startIndex;

  const query = Object.keys(obj)
    .map(key => {
      const val = obj[key];
      const curVal = currentValues[key];
      if (typeof val === 'undefined' || curVal === val) return;

      argIndex += 1;
      args.push(val);

      return `"${key}" = $${argIndex}`;
    })
    .filter(Boolean)
    .join(',');

  return [query, args];
}
