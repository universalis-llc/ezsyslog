import { createSignal } from "solid-js";
import { styled } from "solid-styled-components"

const Options = styled('div')`
transform: translateY(-1px);
position: absolute;
background-color: white;
display: none;
`;
const Container = styled('div')`
display: contents;
input:focus + div {
  display: block;
}
`;

export function Dropdown({ children, ...rest }) {
  return (
    <Container>
      <Options>
        {children}
      </Options>
    </Container>
  )
}