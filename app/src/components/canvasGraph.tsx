import { Accessor, createEffect, createMemo, createSignal, onMount } from "solid-js";

type Data = {
  [k: number]: number
};

export default function Graph({ data }: { data: Accessor<Data> }) {
  let canvasElement: HTMLCanvasElement;
  const [boundsX, setBoundsX] = createSignal([0, 0]);
  const [boundsY, setBoundsY] = createSignal([0, 0]);
  const scaleX = createMemo(() => boundsX()[0] / boundsX()[1]);
  const scaleY = createMemo(() => boundsY()[0] / boundsY()[1]);

  createEffect(() => {
    let [localMinX, localMaxX] = [0, 0];
    let [localMinY, localMaxY] = [0, 0];
    for (const [time, num] of Object.entries(data())) {
      localMinX = Math.min(localMinX, time);
      localMaxX = Math.max(localMaxX, time);
      localMinY = Math.min(localMinY, num);
      localMaxY = Math.max(localMaxY, num);
    }
    setBoundsX([localMinX, localMaxX]);
    setBoundsY([localMinY, localMaxY]);
  })

  onMount(() => {
    const ctx = canvasElement.getContext('2d');
    const scaleX = 
  });

  return (<canvas ref={canvasElement} />)
}