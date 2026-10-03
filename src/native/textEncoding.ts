const WIN_ANSI_EXTRAS = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91],
  [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98],
  [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
]);

function winAnsiByte(character: string): number | undefined {
  const code = character.codePointAt(0) ?? 0;
  if (code <= 0xff) return code;
  return WIN_ANSI_EXTRAS.get(code);
}

export function firstUnencodableWinAnsiCharacter(text: string): string | undefined {
  for (const character of text) if (winAnsiByte(character) === undefined) return character;
  return undefined;
}

export function canEncodeWinAnsiText(text: string): boolean {
  return firstUnencodableWinAnsiCharacter(text) === undefined;
}

export function encodeWinAnsiHex(text: string): string {
  const bytes: number[] = [];
  for (const character of text) {
    const byte = winAnsiByte(character);
    if (byte === undefined) throw new Error(`Character ${character} cannot be encoded by the selected built-in Latin font.`);
    bytes.push(byte);
  }
  return `<${bytes.map((value) => value.toString(16).padStart(2, "0")).join("")}>`;
}
