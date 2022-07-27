import { DateTime } from "luxon";
import { Accessor, createSignal } from "solid-js";

type Transformer<T> = { deserialize: (value: string) => T, serialize: (value: T) => string };

export function useLocalStorage<T>(key: string, initialValue?: T, transformers: Transformer<T> = { deserialize: JSON.parse, serialize: JSON.stringify }): [Accessor<T | undefined>, (value: T) => void] {

  const url = new URL(globalThis.location.href);
  
  let value = url.searchParams.get(key) ?? get(key, transformers);
  if (typeof value === 'undefined') {
    setStorage(key, initialValue, transformers);
    value = initialValue;
  };
  
  const [getVal, setVal] = createSignal<T | undefined>(value);
  return [getVal, (v: T) => {
    setStorage<T>(key, v, transformers);
    setVal(v);
  }];
}

function setStorage<T>(key: string, value: undefined | T, transformers: Transformer<T>) {
  if (typeof value === 'undefined') {
    localStorage.removeItem(key);
    return true;
  }
  localStorage.setItem(key, transformers.serialize(value));
  return false;
}

function get<T>(key: string, transformers: Transformer<T>): T | undefined {
  const val = localStorage.getItem(key) ?? undefined;
  if (val) return transformers.deserialize(val);
  else return undefined;
}