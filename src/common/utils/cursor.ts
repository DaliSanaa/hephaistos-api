export function encodeCursor(id: string, sortValue: string | number): string {
  return Buffer.from(JSON.stringify({ id, sv: sortValue })).toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string): {
  id: string;
  sv: string | number;
} {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
    id: string;
    sv: string | number;
  };
}
