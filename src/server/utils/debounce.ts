/**
 * Debounce utility for delaying function execution
 * Useful for reducing computation on rapid events (e.g., typing)
 */

type Timer = ReturnType<typeof setTimeout>;

/**
 * Creates a debounced function that delays invoking the given function
 * until after the specified wait time has elapsed since the last invocation
 * @param func - The function to debounce
 * @param waitMs - The number of milliseconds to wait
 * @returns A debounced version of the function
 */
export function debounce<T extends unknown[]>(
  func: (...args: T) => void,
  waitMs: number
): (...args: T) => void {
  let timeoutId: Timer | undefined;

  return function debounced(...args: T) {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = undefined;
    }, waitMs);
  };
}

/**
 * Creates a debounced function with immediate execution option
 * @param func - The function to debounce
 * @param waitMs - The number of milliseconds to wait
 * @param immediate - If true, execute immediately on first call
 * @returns A debounced version of the function
 */
export function debounceImmediate<T extends unknown[]>(
  func: (...args: T) => void,
  waitMs: number,
  immediate: boolean = false
): (...args: T) => void {
  let timeoutId: Timer | undefined;
  let callCount = 0;

  return function debounced(...args: T) {
    const shouldCallNow = immediate && callCount === 0;
    callCount++;

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    const later = () => {
      timeoutId = undefined;
      if (!immediate) {
        func(...args);
      }
    };

    timeoutId = setTimeout(later, waitMs);

    if (shouldCallNow) {
      func(...args);
    }
  };
}
