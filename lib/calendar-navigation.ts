// Only our two event destinations are eligible for client navigation.
export function navigateCalendarEvent(
  url: string,
  event: MouseEvent,
  push: (url: string) => void,
) {
  if (
    (url !== "/todos" && url !== "/dashboard") ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const target = (event.currentTarget as HTMLElement | null)?.closest?.(
    "a",
  )?.target;
  if (target && target !== "_self") return;
  event.preventDefault();
  push(url);
}
