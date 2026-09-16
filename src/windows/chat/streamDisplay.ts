/** Complete only our presentation tags for a live preview. Never execute HTML. */
export function streamDisplayText(text: string): string {
  // A split token such as "<bi" should not flash as markup while awaiting the rest.
  let display = text.replace(/<\/?(?:h(?:l)?|b(?:i(?:g)?)?|s(?:m)?)?$/, '');
  display = display.replace(/<(hl|big|sm)>([^<]{0,200})$/, '$&</$1>');
  return display;
}
