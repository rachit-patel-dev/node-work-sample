import moment from 'moment';

interface Options {
  timeIsRequired?: boolean;
}

/**
 * Converts an object to a string representation.
 * 
 * @param obj - The object to convert.
 * @param options - (Optional) The options for conversion.
 * @param options.timeIsRequired - (Optional) Specifies if time is required in the output.
 * @returns The string representation of the object.
 */
export function objectToString(obj: object, options?: Options) {
  const { timeIsRequired = false } = options ?? {};

  const messages: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;

    switch (typeof value) {
      case 'string':
      case 'boolean': {
        messages.push(`"${key}": '${value}'`);
        break;
      }
      case 'number': {
        messages.push(`"${key}": ${value}`);
        break;
      }
      case 'object': {
        if (value instanceof Date) {
          const format = 'MM/DD/YYYY' + (timeIsRequired ? 'hh:mm A' : '');
          messages.push(`"${key}": ${moment(value).format(format)}`);
        } else {
          messages.push(objectToString(value));
        }
        break;
      }
    }
  }

  return messages.join('; ');
}
