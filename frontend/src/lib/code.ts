const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(length = 8): string {
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[arr[i] % CODE_CHARS.length];
  }
  return code;
}
