/**
 * On a phone, the on-screen keyboard can end up covering a focused field —
 * and, for a field with a dropdown underneath it, the dropdown too — before
 * the browser has resized the visual viewport to make room for the
 * keyboard. The delay lets that settle before scrolling the field into
 * view, rather than asking for a position the keyboard hasn't made room for
 * yet.
 */
export function scrollIntoViewOnFocus(e: React.FocusEvent<HTMLElement>) {
  const el = e.currentTarget;
  setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
}
