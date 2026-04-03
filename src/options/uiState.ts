export function getApiKeyFieldType(visible: boolean): 'password' | 'text' {
  return visible ? 'text' : 'password';
}
