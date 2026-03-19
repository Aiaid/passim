export function mapState(state: string): string {
  if (state === 'exited') return 'stopped';
  return state;
}

export function displayName(container: { Names: string[]; Id: string }): string {
  return container.Names[0]?.replace(/^\//, '') ?? container.Id.slice(0, 12);
}
