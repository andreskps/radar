// Búsquedas por una lista de claves de un índice, una consulta `equals` por clave.
// No se usa `where(i).anyOf(lista)` con listas largas: en fake-indexeddb (las pruebas) cada salto
// del cursor recorre el índice desde el principio y 10.000 claves tardan minutos (Fase 6).
// Con `equals` cada clave es una búsqueda directa, en Chrome y en las pruebas.
import type { IndexableType, Table } from 'dexie';

/** Filas cuyo índice `index` vale alguna de las `keys` (claves repetidas se consultan una vez). */
export async function rowsByIndex<T, K, I>(table: Table<T, K, I>, index: string, keys: readonly IndexableType[]): Promise<T[]> {
  const unique = [...new Map(keys.map((k) => [JSON.stringify(k), k])).values()];
  const groups = await Promise.all(unique.map((k) => table.where(index).equals(k).toArray()));
  return groups.flat();
}

/** Borra las filas cuyo índice `index` vale alguna de las `keys`. */
export async function deleteByIndex<T, K, I>(table: Table<T, K, I>, index: string, keys: readonly IndexableType[]): Promise<void> {
  await Promise.all(keys.map((k) => table.where(index).equals(k).delete()));
}

/** Cuenta las filas cuyo índice `index` vale alguna de las `keys` (sin repetir claves). */
export async function countByIndex<T, K, I>(table: Table<T, K, I>, index: string, keys: readonly IndexableType[]): Promise<number> {
  const counts = await Promise.all([...new Set(keys)].map((k) => table.where(index).equals(k).count()));
  return counts.reduce((a, b) => a + b, 0);
}
