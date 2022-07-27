import { createSignal } from "solid-js";
import { styled } from "solid-styled-components"

const Options = styled('div')(({open}) => `
transform: translateY(-1px);
position: absolute;
top: 100%;
background-color: white;
display: ${open ? 'block' : 'none'};
`);

export function Dropdown({ open, children, ...rest }) {
  return (
    <Options open={open()}>
      {children}
    </Options>
  )
}