declare module 'virtual:catalogue' {
  const entries: readonly import('./catalogue').CatalogueEntry[];
  export default entries;
}
